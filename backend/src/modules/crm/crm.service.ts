import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Env } from '../../config/env.schema.js';
import { Clock, dbDate, formatDbTime, formatTime } from '../../core/time/time.js';
import { compositeString, recordId, stringField, TwentyClient, type TwentyRecord } from '../../integrations/twenty/twenty.client.js';
import { ensureDashboard, ensurePipeline } from '../../integrations/twenty/twenty-workspace.js';
import { applyPatch, validPatch } from '../applications/domain/application-rules.js';
import type { ApplicationPatch } from '../../database/schema/restaurant.js';
import { type ApplicationRow, CrmRepository, type UserRow } from './crm.repository.js';
import { onboardingTasks, TASK_PREFIX } from './domain/onboarding-tasks.js';
import { emailValue, isDemoApplication, isDemoGuest, isDemoUser, localizedValue, phoneFromTwenty, phoneValue } from './domain/projection.js';
import { verifyWebhook } from './domain/webhook-signature.js';

/** Emitted by services after a change the CRM should see; the sync runs shortly after. */
export const SEATIKO_CHANGED = 'seatiko.changed';
const MAX_BACKOFF_MS = 5 * 60_000;

export type CrmStatus = {
  enabled: boolean;
  healthy: boolean;
  running: boolean;
  last_success_at?: string;
  last_error_at?: string;
  last_error?: string;
  webhook_configured: boolean;
  last_webhook_at?: string;
};

const iso = (d: Date) => formatTime(d);
const userUpdatedAt = (u: { updatedAt: string; createdAt: string }) => formatDbTime(u.updatedAt || u.createdAt);

/**
 * Mirrors Seatiko into Twenty CRM (people, restaurant companies, reservations,
 * onboarding tasks, kanban and dashboard) and applies allowed CRM edits back.
 * Better than the Go loop: a change triggers a sync within seconds, a failing CRM
 * gets exponential backoff, the status keeps the last error.
 */
@Injectable()
export class CrmService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CrmService.name);
  private readonly client?: TwentyClient;
  private readonly webhookSecret: string;
  private readonly intervalMs: number;
  private schemaReady = false;
  private workspaceReady = false;
  private running?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private debounce?: NodeJS.Timeout;
  private failures = 0;
  private readonly state: CrmStatus;
  readonly publicUrl: string;

  constructor(
    private readonly repo: CrmRepository,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    const key = config.get('TWENTY_API_KEY', { infer: true }) ?? '';
    const base = config.get('TWENTY_BASE_URL', { infer: true }) ?? '';
    if (key && base) this.client = new TwentyClient(base, key);
    this.webhookSecret = config.get('TWENTY_WEBHOOK_SECRET', { infer: true }) ?? '';
    this.intervalMs = config.get('TWENTY_SYNC_INTERVAL_SECONDS', { infer: true }) * 1000;
    this.publicUrl = config.get('TWENTY_PUBLIC_URL', { infer: true }) ?? '';
    this.state = { enabled: Boolean(this.client), healthy: false, running: false, webhook_configured: Boolean(this.webhookSecret) };
  }

  get enabled(): boolean {
    return Boolean(this.client);
  }

  status(): CrmStatus {
    return { ...this.state };
  }

  onApplicationBootstrap(): void {
    if (!this.client) {
      this.logger.log('Twenty CRM synchronization disabled: TWENTY_API_KEY is empty');
      return;
    }
    this.logger.log('Twenty CRM synchronization enabled');
    this.schedule(0);
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
    clearTimeout(this.debounce);
  }

  /** Next run: the interval when healthy, doubling up to 5 min after failures. */
  private schedule(delay = this.failures ? Math.min(MAX_BACKOFF_MS, this.intervalMs * 2 ** this.failures) : this.intervalMs): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reconcile().catch(() => undefined).finally(() => this.schedule()), delay);
    this.timer.unref();
  }

  /** A change in Seatiko: sync in about two seconds (several changes are batched). */
  @OnEvent(SEATIKO_CHANGED)
  trigger(): void {
    if (!this.client) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.reconcile().catch(() => undefined), 2_000);
    this.debounce.unref();
  }

  /** One reconciliation at a time; a call during a run waits for it and runs again. */
  async reconcile(): Promise<void> {
    if (!this.client) throw new Error('Twenty CRM integration is disabled');
    while (this.running) await this.running.catch(() => undefined);
    this.running = this.run(this.client);
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }

  private async run(client: TwentyClient): Promise<void> {
    this.state.running = true;
    try {
      await this.sync(client);
      this.failures = 0;
      Object.assign(this.state, { healthy: true, last_success_at: iso(this.clock.now()), last_error: undefined });
    } catch (error) {
      this.failures++;
      Object.assign(this.state, { healthy: false, last_error: String(error instanceof Error ? error.message : error).slice(0, 500), last_error_at: iso(this.clock.now()) });
      this.logger.warn(`Twenty CRM reconciliation failed: ${this.state.last_error}`);
      throw error;
    } finally {
      this.state.running = false;
    }
  }

  private async sync(client: TwentyClient): Promise<void> {
    if (!this.schemaReady) {
      await client.ensureSchema();
      this.schemaReady = true;
    }
    const [people, companies, reservations] = await Promise.all([client.listAll('people'), client.listAll('companies'), client.listAll('reservations')]);
    const [users, apps, activities, cityRows, bookings] = await Promise.all([this.repo.users(), this.repo.applications(), this.repo.activities(), this.repo.cities(), this.repo.reservations()]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const cityName = new Map(cityRows.map((c) => [c.id, c.name.ro]));

    const personIds = new Map<string, string>();
    const person = async (u: UserRow) => {
      if (!personIds.has(u.id)) personIds.set(u.id, await this.syncUser(client, people, u));
      return personIds.get(u.id)!;
    };
    for (const u of users) if (u.role !== 'admin' && !isDemoUser(u.id)) await person(u);

    const realApps = apps.filter((a) => !isDemoApplication(a.id));
    const companyIds = new Map<string, string>();
    for (const a of realApps) {
      const owner = userById.get(a.ownerUserId);
      if (!owner) throw new Error(`load owner for application ${a.id}: not found`);
      await person(owner);
      companyIds.set(a.id, await this.syncApplication(client, companies, a, owner, cityName.get(a.cityId) ?? ''));
    }

    // Twenty's People → Company link holds one company: a published venue first, then the earliest application.
    const best = new Map<string, ApplicationRow>();
    for (const a of realApps) {
      const cur = best.get(a.ownerUserId);
      const pub = a.status === 'PUBLISHED';
      const curPub = cur?.status === 'PUBLISHED';
      const earlier = cur && (a.createdAt < cur.createdAt || (a.createdAt === cur.createdAt && a.id < cur.id));
      if (!cur || (pub && !curPub) || (pub === curPub && earlier)) best.set(a.ownerUserId, a);
    }
    const linked = new Map(people.map((p) => [recordId(p), stringField(p, 'companyId')]));
    for (const [ownerId, app] of best) {
      const pid = personIds.get(ownerId)!;
      const cid = companyIds.get(app.id)!;
      if (linked.get(pid) !== cid) await client.update('people', pid, { companyId: cid });
    }

    const appByVenue = new Map(realApps.filter((a) => a.venueId).map((a) => [a.venueId!, a]));
    for (const { r, tableNumber } of bookings) {
      if (isDemoGuest(r.userId)) continue;
      const app = appByVenue.get(r.venueId);
      if (!app) continue; // venues without an application (seed / open data) are not in the CRM
      const guest = userById.get(r.userId);
      if (!guest) throw new Error(`load reservation guest ${r.userId}: not found`);
      const guestId = await person(guest);
      const updatedAt = formatDbTime(r.updatedAt || r.createdAt);
      await client.upsert(
        'reservations',
        reservations,
        {
          name: `${r.id.slice(0, 8)} · table ${tableNumber ?? 0}`,
          seatikoReservationId: r.id,
          seatikoUserId: r.userId,
          seatikoVenueId: r.venueId,
          seatikoTableId: r.tableId,
          seatikoUpdatedAt: updatedAt,
          reservedFor: formatDbTime(r.reservedFor),
          guests: r.guests,
          tableNumber: tableNumber ?? 0,
          guestEmail: emailValue(guest.email),
          bookingStatus: r.status,
          source: r.source || 'WEB',
          restaurantId: companyIds.get(app.id),
          guestId,
        },
        (rec) => stringField(rec, 'seatikoReservationId') === r.id,
      );
    }

    await this.syncTasks(client, realApps, companyIds, activities);
    if (!this.workspaceReady) {
      await ensurePipeline(client);
      await ensureDashboard(client);
      this.workspaceReady = true;
    }
  }

  private syncUser(client: TwentyClient, people: TwentyRecord[], u: UserRow): Promise<string> {
    return client.upsert(
      'people',
      people,
      {
        name: { firstName: u.firstName, lastName: u.lastName },
        emails: emailValue(u.email),
        phones: phoneValue(u.phone),
        seatikoUserId: u.id,
        seatikoRole: u.role.toUpperCase(),
        seatikoLocale: u.locale,
        seatikoUpdatedAt: userUpdatedAt(u),
      },
      (rec) => {
        const ext = stringField(rec, 'seatikoUserId');
        return ext ? ext === u.id : compositeString(rec, 'emails', 'primaryEmail').toLowerCase() === u.email.toLowerCase();
      },
    );
  }

  private async syncApplication(client: TwentyClient, companies: TwentyRecord[], a: ApplicationRow, owner: UserRow, city: string): Promise<string> {
    const cityLabel = city || a.cityId;
    const submittedAt = a.submittedAt ? formatDbTime(a.submittedAt) : null;
    const payload: TwentyRecord = {
      name: localizedValue(a.name),
      seatikoId: a.id,
      restaurantStatus: a.status,
      restaurantDescription: localizedValue(a.description),
      cuisine: a.cuisine.join(', '),
      openingHours: a.hoursText,
      averageCheckMdl: a.averageCheck,
      restaurantPhones: phoneValue(a.phone),
      restaurantEmails: emailValue(a.email),
      latitude: a.lat,
      longitude: a.lng,
      cityId: a.cityId,
      cityName: cityLabel,
      submittedAt,
      priceLevel: a.priceLevel,
      photoUrls: JSON.stringify(a.photoUrls),
      rejectReason: a.rejectReason,
      seatikoUpdatedAt: formatDbTime(a.updatedAt),
      address: { addressStreet1: localizedValue(a.address), addressCity: city, addressCountry: 'MD', addressLat: a.lat, addressLng: a.lng },
      venueId: a.venueId ?? '',
      ...(a.website ? { domainName: { primaryLinkUrl: a.website, primaryLinkLabel: a.website, secondaryLinks: [] } } : {}),
    };
    const id = await client.upsert('companies', companies, payload, (rec) => {
      const ext = stringField(rec, 'seatikoId');
      if (ext) return ext === a.id;
      // A legacy company without an email may be adopted by name; a different email is never merged.
      const sameName = stringField(rec, 'name').trim().toLowerCase() === localizedValue(a.name).toLowerCase();
      const recEmail = compositeString(rec, 'restaurantEmails', 'primaryEmail');
      const email = a.email || owner.email;
      return sameName && (!recEmail || !email || recEmail.toLowerCase() === email.toLowerCase());
    });
    // A kanban drag in the CRM cannot move moderation: repair the stage even when nothing else changed.
    const rec = companies.find((c) => recordId(c) === id);
    if (rec) {
      const patch: TwentyRecord = {};
      if (stringField(rec, 'restaurantStatus') !== a.status) patch.restaurantStatus = a.status;
      if (stringField(rec, 'cityName') !== cityLabel) patch.cityName = cityLabel;
      if (submittedAt) {
        if (Date.parse(stringField(rec, 'submittedAt')) !== Math.floor(dbDate(a.submittedAt!).getTime())) patch.submittedAt = submittedAt;
      } else if (rec.submittedAt != null) patch.submittedAt = null;
      if (Object.keys(patch).length) await client.update('companies', id, patch);
    }
    return id;
  }

  /** Owns only tasks with our automation key; people's notes, assignees and manual completions stay. */
  private async syncTasks(client: TwentyClient, apps: ApplicationRow[], companyIds: Map<string, string>, activities: Array<{ applicationId: string; action: string; createdAt: string }>) {
    const existing = new Map<string, TwentyRecord>();
    for (const t of await client.listAll('tasks')) {
      const key = stringField(t, 'seatikoTaskKey');
      if (!key.startsWith(TASK_PREFIX) || !stringField(t, 'seatikoApplicationId')) continue;
      if (existing.has(key)) throw new Error(`Twenty conflict: multiple tasks have Seatiko key "${key}"`);
      existing.set(key, t);
    }
    const now = this.clock.now();
    const desired = new Map(
      apps
        .filter((a) => companyIds.has(a.id))
        .flatMap((a) => onboardingTasks(a, activities.filter((e) => e.applicationId === a.id), now))
        .map((t) => [t.key, t]),
    );
    const targets = desired.size ? await client.listAll('taskTargets') : [];
    for (const key of [...desired.keys()].sort()) {
      const task = desired.get(key)!;
      const rec = existing.get(key);
      let id = recordId(rec);
      if (!rec) {
        id = await client.create('tasks', {
          title: task.title,
          bodyV2: { markdown: task.description },
          dueAt: formatTime(task.dueAt),
          status: 'TODO',
          seatikoTaskKey: task.key,
          seatikoApplicationId: task.applicationId,
          seatikoAutoResolved: false,
        });
      } else if (rec.seatikoAutoResolved === true) {
        await client.update('tasks', id, { seatikoAutoResolved: false, ...(stringField(rec, 'status') === 'DONE' ? { status: 'TODO' } : {}) });
      }
      const companyId = companyIds.get(task.applicationId)!;
      if (!targets.some((t) => stringField(t, 'taskId') === id && stringField(t, 'targetCompanyId') === companyId)) {
        await client.create('taskTargets', { taskId: id, targetCompanyId: companyId });
      }
    }
    for (const [key, t] of existing) {
      if (desired.has(key) || stringField(t, 'status') === 'DONE') continue;
      await client.update('tasks', recordId(t), { status: 'DONE', seatikoAutoResolved: true });
    }
  }

  /**
   * A signed Twenty webhook: contact edits, descriptive restaurant fields and booking
   * status come back to Seatiko; changes made by our own API calls are ignored.
   */
  async webhook(raw: Buffer, signature: string, timestamp: string): Promise<{ ok: true; applied: boolean } | { ok: false; reason: string }> {
    const invalid = verifyWebhook(this.webhookSecret, timestamp, signature, raw);
    if (invalid) return { ok: false, reason: invalid };
    let event: { event?: string; eventName?: string; data?: TwentyRecord; record?: TwentyRecord; updatedFields?: string[] };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return { ok: false, reason: 'decode Twenty webhook' };
    }
    const applied = await this.applyEvent(event);
    this.state.last_webhook_at = iso(this.clock.now());
    return { ok: true, applied };
  }

  private async applyEvent(event: { event?: string; eventName?: string; data?: TwentyRecord; record?: TwentyRecord; updatedFields?: string[] }): Promise<boolean> {
    let data = event.data && Object.keys(event.data).length ? event.data : (event.record ?? {});
    const name = event.event || event.eventName || '';
    const source = ['updatedBy', 'createdBy'].map((k) => (data[k] as TwentyRecord | undefined)?.source).find((s) => typeof s === 'string') as string | undefined;
    if (source?.toUpperCase() === 'API') return false;
    const text = (r: TwentyRecord | undefined, k: string) => (typeof r?.[k] === 'string' ? (r[k] as string) : '');
    const num = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : undefined);
    const now = this.clock.now().toISOString();

    if (name === 'person.updated') {
      const userId = text(data, 'seatikoUserId');
      if (!userId) return false;
      const nm = data.name as TwentyRecord | undefined;
      const result = await this.repo.updateUserFromCrm(
        userId,
        { firstName: text(nm, 'firstName'), lastName: text(nm, 'lastName'), email: text(data.emails as TwentyRecord, 'primaryEmail'), phone: phoneFromTwenty(data.phones as TwentyRecord), locale: text(data, 'seatikoLocale') },
        now,
      );
      if (result === 'email_taken') throw new Error('email_taken');
      return result === 'ok';
    }

    if (name === 'company.updated') {
      const appId = text(data, 'seatikoId');
      if (!appId) return false;
      if (event.updatedFields) {
        // Whole records arrive: import only changed editable fields, so a kanban drag cannot rewrite translations.
        const editable = ['name', 'restaurantDescription', 'cuisine', 'openingHours', 'restaurantPhones', 'restaurantEmails', 'domainName', 'cityId', 'latitude', 'longitude', 'priceLevel', 'averageCheckMdl', 'address'];
        data = Object.fromEntries(event.updatedFields.filter((f) => editable.includes(f) && f in data).map((f) => [f, data[f]]));
        if (!Object.keys(data).length) {
          this.trigger(); // restore protected lifecycle fields
          return false;
        }
      }
      const same = (v: string) => ({ ru: v, en: v, ro: v });
      const patch: ApplicationPatch = {};
      if (text(data, 'name').trim()) patch.name = same(text(data, 'name').trim());
      if (text(data, 'restaurantDescription')) patch.description = same(text(data, 'restaurantDescription'));
      if (text(data, 'cuisine')) patch.cuisine = text(data, 'cuisine').split(',').map((s) => s.trim());
      if (text(data, 'openingHours')) patch.hours_text = text(data, 'openingHours');
      if (phoneFromTwenty(data.restaurantPhones as TwentyRecord)) patch.phone = phoneFromTwenty(data.restaurantPhones as TwentyRecord);
      if (text(data.restaurantEmails as TwentyRecord, 'primaryEmail')) patch.email = text(data.restaurantEmails as TwentyRecord, 'primaryEmail');
      if (text(data.domainName as TwentyRecord, 'primaryLinkUrl')) patch.website = text(data.domainName as TwentyRecord, 'primaryLinkUrl');
      if (text(data, 'cityId')) patch.city_id = text(data, 'cityId');
      if (num('latitude') !== undefined) patch.lat = num('latitude');
      if (num('longitude') !== undefined) patch.lng = num('longitude');
      if (num('priceLevel') !== undefined) patch.price_level = Math.trunc(num('priceLevel')!);
      if (num('averageCheckMdl') !== undefined) patch.average_check = Math.trunc(num('averageCheckMdl')!);
      if (text(data.address as TwentyRecord, 'addressStreet1')) patch.address = same(text(data.address as TwentyRecord, 'addressStreet1'));
      const app = await this.repo.application(appId);
      if (!app) return false;
      const cityIds = new Set((await this.repo.cities()).map((c) => c.id));
      if (!validPatch(patch, app, (c) => cityIds.has(c))) throw new Error('invalid_fields');
      const { next, changed } = applyPatch(app, patch);
      if (changed.length) await this.repo.updateApplicationFromCrm(appId, next, changed, now);
      this.trigger();
      return true;
    }

    if (name === 'reservation.updated') {
      const id = text(data, 'seatikoReservationId');
      const status = text(data, 'bookingStatus');
      if (!id || !status) return false;
      if (!['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'].includes(status)) throw new Error('invalid_status');
      const result = await this.repo.setReservationStatusFromCrm(id, status, now);
      if (result === 'ok') this.trigger();
      return result === 'ok';
    }
    return false;
  }
}
