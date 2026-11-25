import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { turnMinutes } from '../catalog/domain/booking-rules.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import { type EntryRow, WaitlistRepository } from './waitlist.repository.js';

export type WaitlistInput = { venue_id?: string; guest_name?: string; phone?: string; guests?: number; zone?: string; note?: string; source?: string };

const EMPTY = { ru: '', en: '', ro: '' };
const SOURCES = ['WEB', 'ANDROID', 'IOS', 'HOST'];
const ZONES: Record<string, string> = {
  '': 'hall', зал: 'hall', hall: 'hall', indoor: 'hall', main: 'hall',
  улица: 'street', street: 'street', outside: 'street',
  терраса: 'terrace', terrace: 'terrace', patio: 'terrace', veranda: 'terrace', веранда: 'terrace',
  сад: 'garden', garden: 'garden', бар: 'bar', bar: 'bar',
};

/** Floor zone slug (normalizeZone in Go). */
export function normalizeZone(zone = ''): string {
  const z = zone.trim().toLowerCase();
  if (z in ZONES) return ZONES[z];
  return z.replace(/[^a-z0-9_-]/g, '') || 'hall';
}

/**
 * Virtual queue of a venue: guests join remotely when nothing is free, hosts add
 * walk-ins and call, seat or close entries from the stand.
 */
@Injectable()
export class WaitlistService {
  constructor(
    private readonly repo: WaitlistRepository,
    private readonly catalog: CatalogService,
    private readonly accounts: AccountsService,
    private readonly access: VenueAccessService,
    private readonly clock: Clock,
  ) {}

  /** Entries as JSON with position, quoted wait, table number and venue name. */
  private async present(entries: EntryRow[]) {
    const venueIds = [...new Set(entries.map((e) => e.venueId))];
    const [facts, queues, numbers] = await Promise.all([
      this.repo.venueFacts(venueIds),
      this.repo.waitingOf(venueIds),
      this.repo.tableNumbers([...new Set(entries.map((e) => e.tableId).filter(Boolean))]),
    ]);
    return entries.map((e) => {
      const venue = facts.find((f) => f.id === e.venueId);
      let position = 0;
      let quoted = 0;
      if (e.status === 'WAITING' && venue) {
        const idx = queues.filter((q) => q.venueId === e.venueId).findIndex((q) => q.id === e.id);
        if (idx >= 0) {
          position = idx + 1;
          quoted = Math.max(0, idx - venue.freeTables) * turnMinutes({ holdMinutes: venue.holdMinutes, visitDurationMin: 0, maxVisitDurationMin: 0, bookingIntervalMin: 0 });
        }
      }
      const number = numbers.find((n) => n.id === e.tableId)?.number ?? 0;
      return {
        id: e.id,
        venue_id: e.venueId,
        ...(e.userId ? { user_id: e.userId } : {}),
        guest_name: e.guestName,
        ...(e.phone ? { phone: e.phone } : {}),
        guests: e.guests,
        ...(e.zone ? { zone: e.zone } : {}),
        ...(e.note ? { note: e.note } : {}),
        status: e.status,
        source: e.source,
        ...(e.tableId ? { table_id: e.tableId } : {}),
        created_at: formatDbTime(e.createdAt),
        ...(e.notifiedAt ? { notified_at: formatDbTime(e.notifiedAt) } : {}),
        ...(e.seatedAt ? { seated_at: formatDbTime(e.seatedAt) } : {}),
        ...(e.closedAt ? { closed_at: formatDbTime(e.closedAt) } : {}),
        ...(position ? { position } : {}),
        ...(quoted ? { quoted_wait_min: quoted } : {}),
        ...(number ? { table_number: number } : {}),
        venue_name: venue?.name ?? EMPTY,
      };
    });
  }

  private async one(id: string) {
    return (await this.present([(await this.repo.byId(id))!]))[0];
  }

  /** Staff, owner or admin of the venue, else 400 / 403 like gateStaffVenue. */
  async gate(userId: string, venueId?: string): Promise<string> {
    await this.access.requireStaff(userId, venueId);
    return venueId!;
  }

  /** A guest joins (userId set), or a host adds a walk-in (userId empty, source HOST). */
  async join(userId: string, input: WaitlistInput) {
    const venue = input.venue_id ? await this.catalog.publishedVenue(input.venue_id) : undefined;
    if (!venue) throw notFound('not_found');
    const guests = input.guests && input.guests > 0 ? input.guests : 2;
    if (guests > 30) throw badRequest('bad_request');
    let name = (input.guest_name ?? '').trim();
    if (userId) {
      if (await this.repo.hasActive(userId, venue.id)) throw conflict('conflict');
      const user = await this.accounts.user(userId).catch(() => undefined);
      if (!user) throw notFound('not_found');
      name ||= `${user.firstName} ${user.lastName}`.trim() || user.email;
    }
    if (!name) throw badRequest('bad_request');
    const source = (input.source ?? '').trim().toUpperCase();
    const id = randomUUID();
    await this.repo.insert({
      id,
      venueId: venue.id,
      userId,
      guestName: name,
      phone: (input.phone ?? '').trim(),
      guests,
      zone: normalizeZone(input.zone),
      note: (input.note ?? '').trim(),
      status: 'WAITING',
      source: SOURCES.includes(source) ? source : 'WEB',
      createdAt: this.clock.now().toISOString(),
    });
    return this.one(id);
  }

  async mine(userId: string) {
    return this.present(await this.repo.byUser(userId));
  }

  async leave(userId: string, id: string) {
    await this.repo.transaction(async (tx) => {
      const e = await this.repo.lock(tx, id);
      if (!e) throw notFound('not_found');
      if (e.userId !== userId) throw forbidden();
      if (e.status === 'SEATED') throw conflict('conflict');
      await this.repo.update(tx, id, { status: 'LEFT', closedAt: this.clock.now().toISOString() });
    });
    return this.one(id);
  }

  /** Host stand: active queue first (ready, then waiting), then entries closed in the last 6 h. */
  async forVenue(venueId: string) {
    if (!(await this.catalog.publishedVenue(venueId))) throw notFound('not_found');
    const order = (s: string) => (s === 'READY' ? 0 : s === 'WAITING' ? 1 : 2);
    const rows = (await this.repo.forVenue(venueId, new Date(this.clock.now().getTime() - 6 * 3600_000))).sort(
      (a, b) => order(a.status) - order(b.status) || a.createdAt.localeCompare(b.createdAt),
    );
    return this.present(rows);
  }

  /** The entry, after checking the user may work its venue. */
  async gateEntry(userId: string, id: string): Promise<EntryRow> {
    const e = await this.repo.byId(id);
    if (!e) throw notFound('not_found');
    await this.gate(userId, e.venueId);
    return e;
  }

  /** "Table ready": the guest is called and the table held so the floor stops offering it. */
  async notify(id: string, tableId = '') {
    await this.repo.transaction(async (tx) => {
      const e = await this.repo.lock(tx, id);
      if (!e) throw notFound('not_found');
      if (e.status !== 'WAITING') throw conflict('conflict');
      if (tableId) {
        const t = await this.repo.lockTable(tx, tableId);
        if (!t || t.venueId !== e.venueId) throw notFound('not_found');
        if (t.status !== 'FREE') throw conflict('table_not_free');
        await this.repo.setTable(tx, tableId, { status: 'RESERVED' });
      }
      await this.repo.update(tx, id, { status: 'READY', notifiedAt: this.clock.now().toISOString(), ...(tableId ? { tableId } : {}) });
    });
    return this.one(id);
  }

  /** Seats the guest and occupies the table (a booking's table only by its own guest). */
  async seat(id: string, tableId = '') {
    await this.repo.transaction(async (tx) => {
      const e = await this.repo.lock(tx, id);
      if (!e) throw notFound('not_found');
      if (e.status === 'SEATED') throw conflict('conflict');
      const tid = tableId || e.tableId;
      if (!tid) throw badRequest('bad_request');
      const t = await this.repo.lockTable(tx, tid);
      if (!t || t.venueId !== e.venueId) throw notFound('not_found');
      if (t.status === 'OCCUPIED' || (t.status === 'RESERVED' && t.reservationId)) throw conflict('table_not_free');
      const now = this.clock.now().toISOString();
      await this.repo.setTable(tx, tid, { status: 'OCCUPIED', occupiedSince: now });
      await this.repo.update(tx, id, { tableId: tid, status: 'SEATED', seatedAt: now, closedAt: now });
    });
    return this.one(id);
  }

  /** Drops the guest (LEFT or EXPIRED) and frees a table held for them. */
  async close(id: string, status = 'LEFT') {
    if (status !== 'LEFT' && status !== 'EXPIRED') throw badRequest('bad_request');
    await this.repo.transaction(async (tx) => {
      const e = await this.repo.lock(tx, id);
      if (!e) throw notFound('not_found');
      if (e.status === 'SEATED') throw conflict('conflict');
      if (e.tableId) {
        const t = await this.repo.lockTable(tx, e.tableId);
        if (t?.status === 'RESERVED') await this.repo.setTable(tx, e.tableId, { status: 'FREE' });
      }
      await this.repo.update(tx, id, { tableId: '', status, closedAt: this.clock.now().toISOString() });
    });
    return this.one(id);
  }
}
