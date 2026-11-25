import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { signQr } from '../../core/qr/qr-token.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import type { ApplicationPatch } from '../../database/schema/restaurant.js';
import { photoJpeg } from '../../integrations/storage/image.js';
import { MediaStorage } from '../../integrations/storage/media-storage.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { applicationComplete, applyPatch, DEFAULT_LAYOUT, MAX_APPLICATION_PHOTOS, type Profile, REVIEW_STATUSES, reviewAction, validPatch } from './domain/application-rules.js';
import { type ActivityRow, type ApplicationRow, ApplicationsRepository, type ChangeRow, type Db } from './applications.repository.js';

const EDITABLE = ['DRAFT', 'REJECTED'];

const profileOf = (a: ApplicationRow): Profile => ({
  name: a.name, description: a.description, address: a.address, cuisine: a.cuisine, phone: a.phone, email: a.email, website: a.website,
  cityId: a.cityId, lat: a.lat, lng: a.lng, priceLevel: a.priceLevel, averageCheck: a.averageCheck, hoursText: a.hoursText, photoUrls: a.photoUrls,
});

export function presentApplication(a: ApplicationRow) {
  const opt = (v: number | boolean) => (v ? v : undefined);
  return {
    id: a.id,
    owner_user_id: a.ownerUserId,
    status: a.status,
    name: a.name,
    description: a.description,
    address: a.address,
    cuisine: a.cuisine,
    phone: a.phone,
    email: a.email,
    ...(a.website ? { website: a.website } : {}),
    city_id: a.cityId,
    lat: a.lat,
    lng: a.lng,
    price_level: a.priceLevel,
    average_check: a.averageCheck,
    photo_urls: a.photoUrls,
    hours_text: a.hoursText,
    ...(a.rejectReason ? { reject_reason: a.rejectReason } : {}),
    ...(a.venueId ? { venue_id: a.venueId } : {}),
    ...Object.fromEntries(
      Object.entries({
        booking_interval_min: opt(a.bookingIntervalMin),
        hold_minutes: opt(a.holdMinutes),
        allow_preorder: opt(a.allowPreorder),
        session_start_before_min: opt(a.sessionStartBeforeMin),
        release_before_min: opt(a.releaseBeforeMin),
        max_late_arrival_min: opt(a.maxLateArrivalMin),
        visit_duration_min: opt(a.visitDurationMin),
        max_visit_duration_min: opt(a.maxVisitDurationMin),
      }).filter(([, v]) => v !== undefined),
    ),
    created_at: formatDbTime(a.createdAt),
    updated_at: formatDbTime(a.updatedAt),
    ...(a.submittedAt ? { submitted_at: formatDbTime(a.submittedAt) } : {}),
  };
}

const presentActivity = (e: ActivityRow) => ({
  id: e.id,
  application_id: e.applicationId,
  actor_user_id: e.actorUserId,
  actor_role: e.actorRole,
  action: e.action,
  // Go encodes an empty list here as null.
  changed_fields: e.changedFields.length ? e.changedFields : null,
  ...(e.note ? { note: e.note } : {}),
  created_at: formatDbTime(e.createdAt),
});

const presentChange = (c: ChangeRow) => ({
  id: c.id,
  application_id: c.applicationId,
  owner_user_id: c.ownerUserId,
  status: c.status,
  patch: c.patch,
  created_at: formatDbTime(c.createdAt),
  ...(c.note ? { note: c.note } : {}),
});

/** Restaurant onboarding: owners fill and submit, admins review and publish; later edits go through change requests. */
@Injectable()
export class ApplicationsService {
  private readonly qrSecret: string;

  constructor(
    private readonly repo: ApplicationsRepository,
    private readonly catalog: CatalogService,
    private readonly media: MediaStorage,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.qrSecret = config.get('QR_SECRET', { infer: true });
  }

  private now() {
    return this.clock.now().toISOString();
  }

  private async record(db: Db, appId: string, actorId: string, action: string, changed: string[] = [], note = '') {
    const role = (await this.repo.userRole(actorId, db)) ?? 'system';
    await this.repo.record(db, { id: randomUUID(), applicationId: appId, actorUserId: actorId, actorRole: role, action, changedFields: changed, note, createdAt: this.now() });
  }

  async create(ownerId: string) {
    const role = await this.repo.userRole(ownerId);
    if (!role) throw notFound('user_not_found');
    if (role !== 'restaurant' && role !== 'admin') throw forbidden();
    const app = await this.repo.transaction(async (tx) => {
      const now = this.now();
      const created = await this.repo.insert(tx, {
        id: randomUUID(),
        ownerUserId: ownerId,
        status: 'DRAFT',
        name: { ru: '', en: '', ro: '' },
        description: { ru: '', en: '', ro: '' },
        address: { ru: '', en: '', ro: '' },
        cityId: 'city-balti',
        createdAt: now,
        updatedAt: now,
      });
      await this.record(tx, created.id, ownerId, 'APPLICATION_CREATED');
      return created;
    });
    return presentApplication(app);
  }

  async mine(ownerId: string) {
    return (await this.repo.byOwner(ownerId)).map(presentApplication);
  }

  /** The owner's application, or any for an admin. */
  async get(userId: string, id: string) {
    const app = await this.repo.byId(id);
    if (!app) throw notFound('not_found');
    if (app.ownerUserId !== userId && (await this.repo.userRole(userId)) !== 'admin') throw forbidden();
    return presentApplication(app);
  }

  async remove(userId: string, id: string) {
    await this.repo.transaction(async (tx) => {
      const app = await this.repo.lock(tx, id);
      if (!app) throw notFound('not_found');
      if (app.ownerUserId !== userId && (await this.repo.userRole(userId, tx)) !== 'admin') throw forbidden();
      await this.repo.remove(tx, app);
    });
    return { ok: true };
  }

  async activity(userId: string, id: string) {
    const app = await this.repo.byId(id);
    if (!app) throw notFound('not_found');
    if (app.ownerUserId !== userId && (await this.repo.userRole(userId)) !== 'admin') throw forbidden();
    return (await this.repo.activity(id)).map(presentActivity);
  }

  /** Owner edits a draft (or a rejected application, which returns to draft). */
  async update(ownerId: string, id: string, patch: ApplicationPatch) {
    const cities = await this.catalog.listCities();
    const app = await this.repo.transaction(async (tx) => {
      const cur = await this.repo.lock(tx, id);
      if (!cur) throw notFound('not_found');
      if (cur.ownerUserId !== ownerId) throw forbidden();
      if (!EDITABLE.includes(cur.status)) throw conflict('not_editable');
      if (!validPatch(patch, cur, (c) => cities.some((x) => x.id === c && x.country === 'MD'))) throw badRequest('invalid_fields');
      const { next, changed } = applyPatch(profileOf(cur), patch);
      if (!changed.length) return cur;
      const updated = await this.repo.update(tx, id, {
        ...next,
        ...(cur.status === 'REJECTED' ? { status: 'DRAFT', rejectReason: '' } : {}),
        updatedAt: this.now(),
      });
      await this.record(tx, id, ownerId, 'PROFILE_UPDATED', changed);
      return updated;
    });
    return presentApplication(app);
  }

  /** A venue photo: re-encoded JPEG (EXIF dropped), up to 8 per application. */
  async addPhoto(ownerId: string, id: string, data: Uint8Array) {
    const app = await this.repo.byId(id);
    if (!app) throw notFound('not_found');
    if (app.ownerUserId !== ownerId) throw forbidden();
    if (!EDITABLE.includes(app.status)) throw conflict('not_editable');
    if (app.photoUrls.length >= MAX_APPLICATION_PHOTOS) throw badRequest('max_photos');
    const key = `venues/${id}/${randomUUID()}.jpg`;
    const url = await this.media.put(key, 'image/jpeg', await photoJpeg(data));
    try {
      const updated = await this.repo.transaction(async (tx) => {
        const cur = (await this.repo.lock(tx, id))!;
        if (cur.photoUrls.length >= MAX_APPLICATION_PHOTOS) throw badRequest('max_photos');
        const row = await this.repo.update(tx, id, {
          photoUrls: [...cur.photoUrls, url],
          ...(cur.status === 'REJECTED' ? { status: 'DRAFT', rejectReason: '' } : {}),
          updatedAt: this.now(),
        });
        await this.record(tx, id, ownerId, 'PHOTO_ADDED', ['photos']);
        return row;
      });
      return { application: presentApplication(updated), url };
    } catch (error) {
      await this.media.delete(key);
      throw error;
    }
  }

  async removePhoto(ownerId: string, id: string, url: string) {
    const updated = await this.repo.transaction(async (tx) => {
      const cur = await this.repo.lock(tx, id);
      if (!cur) throw notFound('not_found');
      if (cur.ownerUserId !== ownerId) throw forbidden();
      if (!EDITABLE.includes(cur.status)) throw conflict('not_editable');
      const idx = cur.photoUrls.indexOf(url);
      if (idx < 0) throw notFound('not_found');
      const row = await this.repo.update(tx, id, {
        photoUrls: cur.photoUrls.filter((_, i) => i !== idx),
        ...(cur.status === 'REJECTED' ? { status: 'DRAFT', rejectReason: '' } : {}),
        updatedAt: this.now(),
      });
      await this.record(tx, id, ownerId, 'PHOTO_REMOVED', ['photos']);
      return row;
    });
    const key = this.media.keyOf(url);
    if (key) await this.media.delete(key);
    return presentApplication(updated);
  }

  async submit(ownerId: string, id: string) {
    const app = await this.repo.transaction(async (tx) => {
      const cur = await this.repo.lock(tx, id);
      if (!cur) throw notFound('not_found');
      if (cur.ownerUserId !== ownerId) throw forbidden();
      if (!EDITABLE.includes(cur.status)) throw conflict('invalid_status');
      if (!applicationComplete(profileOf(cur))) throw badRequest('incomplete');
      const now = this.now();
      const row = await this.repo.update(tx, id, { status: 'SUBMITTED', rejectReason: '', submittedAt: now, updatedAt: now });
      await this.record(tx, id, ownerId, 'APPLICATION_SUBMITTED');
      return row;
    });
    return presentApplication(app);
  }

  async all(status?: string) {
    return (await this.repo.all(status || undefined)).map(presentApplication);
  }

  async review(adminId: string, id: string, status: string, rejectReason = '') {
    if (!(REVIEW_STATUSES as readonly string[]).includes(status)) throw badRequest('invalid_status');
    if (status === 'REJECTED' && !rejectReason.trim()) throw badRequest('reject_reason_required');
    const app = await this.repo.transaction(async (tx) => {
      if (!(await this.repo.lock(tx, id))) throw notFound('not_found');
      const row = await this.repo.update(tx, id, { status, rejectReason: status === 'REJECTED' ? rejectReason : '', updatedAt: this.now() });
      await this.record(tx, id, adminId, reviewAction(status), [], rejectReason);
      return row;
    });
    return presentApplication(app);
  }

  /** Approved → a live venue with a booking-ready floor plan and signed table QR codes. */
  async publish(adminId: string, id: string) {
    const app = await this.repo.transaction(async (tx) => {
      const cur = await this.repo.lock(tx, id);
      if (!cur) throw notFound('not_found');
      if (cur.status !== 'APPROVED' || cur.venueId) throw conflict('not_approvable');
      const venueId = `venue-${randomUUID()}`;
      const or = (v: number, d: number) => v || d;
      await this.repo.insertVenue(tx, {
        id: venueId,
        cityId: cur.cityId || 'city-balti',
        name: cur.name,
        description: cur.description,
        cuisine: cur.cuisine,
        priceLevel: cur.priceLevel,
        address: cur.address,
        lat: cur.lat,
        lng: cur.lng,
        averageCheck: cur.averageCheck,
        openNow: true,
        imageUrl: cur.photoUrls[0] ?? '',
        photoUrls: cur.photoUrls,
        phone: cur.phone,
        website: cur.website,
        hoursText: cur.hoursText,
        sessionStartBeforeMin: or(cur.sessionStartBeforeMin, 60),
        releaseBeforeMin: or(cur.releaseBeforeMin, 15),
        bookingIntervalMin: or(cur.bookingIntervalMin, 30),
        holdMinutes: or(cur.holdMinutes, 15),
        maxLateArrivalMin: or(cur.maxLateArrivalMin, 30),
        visitDurationMin: or(cur.visitDurationMin, 90),
        maxVisitDurationMin: or(cur.maxVisitDurationMin, 180),
        allowPreorder: cur.allowPreorder,
      });
      await this.repo.insertTables(
        tx,
        DEFAULT_LAYOUT.map((p, i) => {
          const tableId = randomUUID();
          return { id: tableId, venueId, number: i + 1, seats: p.seats, status: 'FREE', x: p.x, y: p.y, zone: p.zone, qrToken: signQr(this.qrSecret, venueId, tableId) };
        }),
      );
      await this.repo.moveToVenue(tx, id, venueId);
      const row = await this.repo.update(tx, id, { status: 'PUBLISHED', venueId, updatedAt: this.now() });
      await this.record(tx, id, adminId, 'APPLICATION_PUBLISHED');
      return row;
    });
    return { application: presentApplication(app), venue_id: app.venueId };
  }

  /** After publication the owner asks for profile changes; an admin applies them. */
  async requestChange(ownerId: string, id: string, patch: ApplicationPatch) {
    const app = await this.repo.byId(id);
    if (!app) throw notFound('not_found');
    if (app.ownerUserId !== ownerId) throw forbidden();
    if (app.status !== 'PUBLISHED') throw conflict('conflict');
    const change = await this.repo.transaction(async (tx) => {
      const row = await this.repo.insertChange(tx, { id: randomUUID(), applicationId: id, ownerUserId: ownerId, status: 'PENDING', patch, createdAt: this.now() });
      await this.record(tx, id, ownerId, 'PROFILE_CHANGE_REQUESTED');
      return row;
    });
    return presentChange(change);
  }

  async changes(ownerId?: string) {
    return (await this.repo.changes(ownerId)).map(presentChange);
  }

  async reviewChange(adminId: string, changeId: string, status: string, note = '') {
    const change = await this.repo.transaction(async (tx) => {
      const c = await this.repo.lockChange(tx, changeId);
      if (!c) throw notFound('not_found');
      if (c.status !== 'PENDING') throw conflict('conflict');
      if (status === 'APPROVED') {
        const app = await this.repo.lock(tx, c.applicationId);
        if (!app) throw notFound('not_found');
        const { next } = applyPatch(profileOf(app), c.patch);
        await this.repo.update(tx, app.id, { ...next, updatedAt: this.now() });
        if (app.venueId) {
          await this.repo.updateVenue(tx, app.venueId, {
            name: next.name,
            description: next.description,
            address: next.address,
            cuisine: next.cuisine,
            website: next.website,
            cityId: next.cityId,
            lat: next.lat,
            lng: next.lng,
            priceLevel: next.priceLevel,
            averageCheck: next.averageCheck,
            hoursText: next.hoursText,
            phone: next.phone,
          });
        }
        await this.record(tx, app.id, adminId, 'PROFILE_CHANGE_APPROVED', [], note);
        return this.repo.updateChange(tx, changeId, { status: 'APPROVED' });
      }
      if (status === 'REJECTED') {
        await this.record(tx, c.applicationId, adminId, 'PROFILE_CHANGE_REJECTED', [], note);
        return this.repo.updateChange(tx, changeId, { status: 'REJECTED', note });
      }
      throw badRequest('bad_request');
    });
    return presentChange(change);
  }
}
