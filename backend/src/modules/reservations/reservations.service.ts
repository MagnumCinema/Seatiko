import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound, pgCode } from '../../core/errors/domain-error.js';
import { Clock, dbDate } from '../../core/time/time.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { VenueRecord } from '../catalog/catalog.repository.js';
import { tableBusyAt } from '../catalog/domain/availability.js';
import { visitMinutes } from '../catalog/domain/booking-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { presentOrder } from '../orders/order.presenter.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { ACTIVE_BOOKING_LOOKBACK_MS, bookingDuration, bookingSource, bookingWindow, maxLateArrivalMinutes, tstzrange } from './domain/rules.js';
import { presentReservation } from './reservations.presenter.js';
import { type ReservationRow, ReservationsRepository, type TableRow, type Tx } from './reservations.repository.js';

const DAY = 24 * 3600_000;
const ONE_ACTIVE_MESSAGE =
  'У вас уже есть активная бронь стола. Во избежание спама система разрешает одну активную бронь. Вы можете изменить её или отменить.';

export type CreateReservation = { venueId: string; tableIds: string[]; guests: number; reservedFor: Date; durationMin: number; notes: string; source?: string };
export type UpdateReservation = { tableIds: string[]; guests: number; reservedFor?: Date; notes: string };

/** The EXCLUDE constraint caught an overlap a concurrent request created. */
const overlapped = (error: unknown) => pgCode(error) === '23P01';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly repo: ReservationsRepository,
    private readonly orders: OrdersRepository,
    private readonly catalog: CatalogService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  private durationOf(r: ReservationRow, venue: VenueRecord | undefined): number {
    return r.durationMin > 0 ? r.durationMin : venue ? visitMinutes(venue) : 90;
  }

  /** Busy for [start, start+span)? Other bookings' windows plus the table's live state. */
  private async anyBusy(tx: Tx, venue: VenueRecord, tables: TableRow[], start: Date, durationMin: number, except = ''): Promise<boolean> {
    const now = this.clock.now();
    const blocks = (await this.repo.blocks(tx, tables.map((t) => t.id), new Date(start.getTime() - DAY), new Date(start.getTime() + DAY), except)).map((b) => ({
      tableId: b.tableId,
      from: dbDate(b.from),
      until: dbDate(b.until),
    }));
    return tables.some((t) =>
      tableBusyAt(
        {
          id: t.id,
          venueId: t.venueId,
          number: t.number,
          seats: t.seats,
          // Its own booking does not make a table busy when that booking moves.
          status: except && t.reservationId === except ? 'FREE' : t.status,
          occupiedSince: t.occupiedSince ? dbDate(t.occupiedSince) : null,
          reservedFor: t.reservedFor ? dbDate(t.reservedFor) : null,
        },
        blocks,
        start,
        durationMin * 60_000,
        now,
        visitMinutes(venue) * 60_000,
      ),
    );
  }

  async create(userId: string, input: CreateReservation) {
    const venue = await this.catalog.publishedVenue(input.venueId);
    if (!venue) throw notFound('not_found');
    const tableIds = [...new Set(input.tableIds)];
    if (input.guests < 1) throw badRequest('invalid_guests');
    const duration = bookingDuration(venue, input.durationMin);
    if (duration === undefined) throw badRequest('invalid_duration');
    const now = this.clock.now();
    const id = randomUUID();
    try {
      await this.repo.transaction(async (tx) => {
        if (await this.repo.hasActive(tx, userId, new Date(now.getTime() - ACTIVE_BOOKING_LOOKBACK_MS))) {
          throw conflict('active_reservation_exists', { message: ONE_ACTIVE_MESSAGE });
        }
        const tables = await this.repo.lockTables(tx, venue.id, tableIds);
        if (tables.length !== tableIds.length) throw notFound('not_found');
        if (await this.anyBusy(tx, venue, tables, input.reservedFor, duration)) throw conflict('table_not_free');
        const at = input.reservedFor.toISOString();
        await this.repo.insert(
          tx,
          {
            id,
            userId,
            venueId: venue.id,
            tableId: tableIds[0],
            guests: input.guests,
            reservedFor: at,
            durationMin: duration,
            status: 'CONFIRMED',
            source: bookingSource(input.source),
            notes: input.notes,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          tableIds,
          tstzrange(bookingWindow(input.reservedFor, null, duration)),
        );
        await this.repo.markReserved(tx, tableIds, at, id);
      });
    } catch (error) {
      if (overlapped(error)) throw conflict('table_not_free');
      throw error;
    }
    return this.present(id);
  }

  /** One reservation as JSON (with held tables). */
  private async present(id: string) {
    const r = (await this.repo.byId(id))!;
    return presentReservation(r, await this.repo.heldTables([id]));
  }

  /** Locks the guest's own reservation or fails like Go (404 / 403). */
  private async own(tx: Tx, userId: string, id: string): Promise<ReservationRow> {
    const r = await this.repo.lock(tx, id);
    if (!r) throw notFound('reservation_not_found');
    if (r.userId !== userId) throw forbidden();
    return r;
  }

  async update(userId: string, id: string, input: UpdateReservation) {
    try {
      await this.repo.transaction(async (tx) => {
        const r = await this.own(tx, userId, id);
        if (r.status !== 'CONFIRMED') throw conflict('invalid_status');
        if (input.guests < 1) throw badRequest('invalid_params');
        const venue = await this.catalog.publishedVenue(r.venueId);
        const current = (await this.repo.heldTables([id], tx)).map((h) => h.tableId);
        const tableIds = [...new Set(input.tableIds.length ? input.tableIds : current.length ? current : [r.tableId])];
        const tables = await this.repo.lockTables(tx, r.venueId, tableIds);
        if (tables.length !== tableIds.length) throw notFound('reservation_not_found');
        if (tables.some((t) => !current.includes(t.id) && t.id !== r.tableId && t.status !== 'FREE')) throw conflict('table_not_free');
        const reservedFor = input.reservedFor ?? dbDate(r.reservedFor);
        const duration = this.durationOf(r, venue);
        if (venue && (await this.anyBusy(tx, venue, tables, reservedFor, duration, id))) throw conflict('table_not_free');

        await this.repo.freeTables(tx, id, current.filter((t) => !tableIds.includes(t)));
        await this.repo.replaceHeld(tx, id, tableIds, tstzrange(bookingWindow(reservedFor, null, duration)), true);
        await this.repo.markReserved(tx, tableIds, reservedFor.toISOString(), id, true);
        await this.repo.update(tx, id, {
          tableId: tableIds[0],
          guests: input.guests,
          reservedFor: reservedFor.toISOString(),
          ...(input.notes ? { notes: input.notes } : {}),
          updatedAt: this.clock.now().toISOString(),
        });
      });
    } catch (error) {
      if (overlapped(error)) throw conflict('table_not_free');
      throw error;
    }
    return this.present(id);
  }

  /** "I'm coming": checks the guest in, optionally announcing a late arrival within the venue limit. */
  async confirmArrival(userId: string, id: string, expectedArrival?: Date) {
    try {
      await this.repo.transaction(async (tx) => {
        const r = await this.own(tx, userId, id);
        if (r.status !== 'CONFIRMED') throw conflict('invalid_status');
        const venue = await this.catalog.publishedVenue(r.venueId);
        const reservedFor = dbDate(r.reservedFor);
        if (expectedArrival && venue && expectedArrival.getTime() > reservedFor.getTime() + maxLateArrivalMinutes(venue) * 60_000) {
          throw conflict('invalid_status');
        }
        const now = this.clock.now();
        if (expectedArrival) await this.repo.setWindow(tx, id, tstzrange(bookingWindow(reservedFor, expectedArrival, this.durationOf(r, venue))));
        await this.repo.update(tx, id, {
          ...(expectedArrival ? { expectedArrival: expectedArrival.toISOString() } : {}),
          arrivalConfirmedAt: now.toISOString(),
          status: 'CHECKED_IN',
          updatedAt: now.toISOString(),
        });
      });
    } catch (error) {
      if (overlapped(error)) throw conflict('invalid_status');
      throw error;
    }
    return this.present(id);
  }

  async cancel(userId: string, id: string) {
    const publish: Array<() => void> = [];
    await this.repo.transaction(async (tx) => {
      const r = await this.own(tx, userId, id);
      if (r.status === 'CANCELLED' || r.status === 'CHECKED_IN') throw conflict('invalid_status');
      const now = this.clock.now().toISOString();
      await this.repo.update(tx, id, { status: 'CANCELLED', updatedAt: now });
      await this.repo.release(tx, id);
      await this.repo.freeTables(tx, id);
      publish.push(...(await this.cancelPreorder(tx, r, now)));
    });
    for (const p of publish) p();
    return this.present(id);
  }

  /** Cancels the booking's preorder that the kitchen has not started, and tells the staff. */
  async cancelPreorder(tx: Tx, r: ReservationRow, now: string): Promise<Array<() => void>> {
    const o = await this.orders.activePreorder(r.id, tx);
    if (!o || (o.status !== 'SUBMITTED' && o.status !== 'DRAFT')) return [];
    await this.orders.update(tx, o.id, { status: 'CANCELLED', updatedAt: now });
    const staff = await this.notifications.venueStaffRecipients(o.venueId, tx);
    return [await this.notifications.notify('PREORDER_CANCELLED', staff, { venueId: o.venueId, reservationId: r.id, orderId: o.id, at: r.reservedFor }, tx)];
  }

  async remove(userId: string, id: string) {
    await this.repo.transaction(async (tx) => {
      await this.own(tx, userId, id);
      await this.repo.freeTables(tx, id);
      await this.repo.delete(tx, id);
    });
    return { status: 'deleted' };
  }

  /** Deletes finished bookings: cancelled, checked in, or over 2 h ago. */
  async clearHistory(userId: string) {
    const cleared = await this.repo.transaction(async (tx) => {
      const ids = await this.repo.historyIds(tx, userId, new Date(this.clock.now().getTime() - 2 * 3600_000));
      for (const id of ids) {
        await this.repo.freeTables(tx, id);
        await this.repo.delete(tx, id);
      }
      return ids.length;
    });
    return { cleared };
  }

  /** The guest's bookings, newest first, with venue names, table numbers and preorders. */
  async list(userId: string) {
    const rows = await this.repo.byUser(userId);
    const ids = rows.map((r) => r.id);
    const [held, preorders] = await Promise.all([this.repo.heldTables(ids), this.orders.activePreorders(ids)]);
    const now = this.clock.now();
    return rows.map((r) => {
      const po = preorders.find((o) => o.reservationId === r.id);
      return presentReservation(r, held, { venueName: r.venueName, preorder: po ? presentOrder(po, now) : undefined });
    });
  }

  async byId(id: string): Promise<ReservationRow | undefined> {
    return this.repo.byId(id);
  }
}

