import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { eventInquiries, reservations, reservationTables, tables, tableWatches, venues } from '../../database/schema/index.js';

export type ReservationRow = typeof reservations.$inferSelect;
export type TableRow = typeof tables.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Db = Database | Tx;
/** Tables of a reservation in booking order, with numbers. */
export type HeldTable = { reservationId: string; tableId: string; number: number | null };

/**
 * Reservations, the tables they hold (reservation_tables, guarded by the EXCLUDE
 * constraint) and the live table state a booking changes (tables.status / reserved_for).
 */
@Injectable()
export class ReservationsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async byId(id: string, db: Db = this.db): Promise<ReservationRow | undefined> {
    const [row] = await db.select().from(reservations).where(eq(reservations.id, id));
    return row;
  }

  /** Same as byId, locking the row for the transaction. */
  async lock(tx: Tx, id: string): Promise<ReservationRow | undefined> {
    const [row] = await tx.select().from(reservations).where(eq(reservations.id, id)).for('update');
    return row;
  }

  async byUser(userId: string): Promise<Array<ReservationRow & { venueName: { ru: string; en: string; ro: string } | null }>> {
    const rows = await this.db
      .select({ r: reservations, venueName: venues.name })
      .from(reservations)
      .leftJoin(venues, eq(venues.id, reservations.venueId))
      .where(eq(reservations.userId, userId))
      .orderBy(desc(reservations.reservedFor));
    return rows.map(({ r, venueName }) => ({ ...r, venueName }));
  }

  async heldTables(reservationIds: string[], db: Db = this.db): Promise<HeldTable[]> {
    if (!reservationIds.length) return [];
    return db
      .select({ reservationId: reservationTables.reservationId, tableId: reservationTables.tableId, number: tables.number })
      .from(reservationTables)
      .leftJoin(tables, eq(tables.id, reservationTables.tableId))
      .where(inArray(reservationTables.reservationId, reservationIds))
      .orderBy(asc(reservationTables.reservationId), asc(reservationTables.position));
  }

  /** Another active booking of this guest from `since` on (anti-spam rule). */
  async hasActive(tx: Tx, userId: string, since: Date): Promise<boolean> {
    const [row] = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.userId, userId), inArray(reservations.status, ['CONFIRMED', 'CHECKED_IN']), gt(reservations.reservedFor, since.toISOString())))
      .limit(1);
    return Boolean(row);
  }

  /** The venue's tables with these ids, locked so concurrent bookings queue up. */
  async lockTables(tx: Tx, venueId: string, ids: string[]): Promise<TableRow[]> {
    if (!ids.length) return [];
    return tx.select().from(tables).where(and(eq(tables.venueId, venueId), inArray(tables.id, ids))).orderBy(asc(tables.id)).for('update');
  }

  /** Active bookings of these tables overlapping [from, until), other than `exceptReservation`. */
  async blocks(db: Db, tableIds: string[], from: Date, until: Date, exceptReservation = '') {
    if (!tableIds.length) return [];
    const rows = await db
      .select({
        tableId: reservationTables.tableId,
        from: sql<string>`lower(${reservationTables.blocks})::text`,
        until: sql<string>`upper(${reservationTables.blocks})::text`,
      })
      .from(reservationTables)
      .where(
        and(
          inArray(reservationTables.tableId, tableIds),
          eq(reservationTables.active, true),
          ne(reservationTables.reservationId, exceptReservation),
          sql`${reservationTables.blocks} && tstzrange(${from.toISOString()}::timestamptz, ${until.toISOString()}::timestamptz)`,
        ),
      );
    return rows;
  }

  async insert(tx: Tx, row: typeof reservations.$inferInsert, tableIds: string[], blocks: string): Promise<void> {
    await tx.insert(reservations).values(row);
    await tx.insert(reservationTables).values(tableIds.map((tableId, position) => ({ reservationId: row.id, tableId, position, blocks, active: true })));
  }

  async update(tx: Tx, id: string, patch: Partial<typeof reservations.$inferInsert>): Promise<ReservationRow> {
    const [row] = await tx.update(reservations).set(patch).where(eq(reservations.id, id)).returning();
    return row;
  }

  /** New table set and window of a booking. */
  async replaceHeld(tx: Tx, id: string, tableIds: string[], blocks: string, active: boolean): Promise<void> {
    await tx.delete(reservationTables).where(eq(reservationTables.reservationId, id));
    await tx.insert(reservationTables).values(tableIds.map((tableId, position) => ({ reservationId: id, tableId, position, blocks, active })));
  }

  async setWindow(tx: Tx, id: string, blocks: string): Promise<void> {
    await tx.update(reservationTables).set({ blocks }).where(eq(reservationTables.reservationId, id));
  }

  async release(tx: Tx, id: string): Promise<void> {
    await tx.update(reservationTables).set({ active: false }).where(eq(reservationTables.reservationId, id));
  }

  /** Live state: a table shows its nearest booking; seated / cleaning tables keep theirs. */
  async markReserved(tx: Tx, tableIds: string[], reservedFor: string, reservationId: string, force = false): Promise<void> {
    if (!tableIds.length) return;
    await tx
      .update(tables)
      .set({ status: 'RESERVED', reservedFor, reservationId })
      .where(
        and(
          inArray(tables.id, tableIds),
          force
            ? undefined
            : or(eq(tables.status, 'FREE'), and(eq(tables.status, 'RESERVED'), or(sql`${tables.reservedFor} is null`, gt(tables.reservedFor, reservedFor)))),
        ),
      );
  }

  /** Frees the tables still showing this reservation (optionally only some of them). */
  async freeTables(tx: Tx, reservationId: string, onlyTables?: string[]): Promise<void> {
    await tx
      .update(tables)
      .set({ status: 'FREE', reservedFor: null, reservationId: null })
      .where(and(eq(tables.reservationId, reservationId), onlyTables ? inArray(tables.id, onlyTables.length ? onlyTables : ['']) : undefined));
  }

  async delete(tx: Tx, id: string): Promise<void> {
    await tx.delete(reservations).where(eq(reservations.id, id));
  }

  /** Finished bookings of a guest: cancelled, checked in, or more than 2 h in the past. */
  async historyIds(tx: Tx, userId: string, cutoff: Date): Promise<string[]> {
    const rows = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, userId),
          or(inArray(reservations.status, ['CANCELLED', 'CHECKED_IN']), sql`${reservations.reservedFor} < ${cutoff.toISOString()}`),
        ),
      );
    return rows.map((r) => r.id);
  }

  // Event requests (banquets) and table watches: small guest records of the booking flow.

  async insertInquiry(row: typeof eventInquiries.$inferInsert) {
    const [created] = await this.db.insert(eventInquiries).values(row).returning();
    return created;
  }

  inquiriesOf(userId: string) {
    return this.db
      .select({ q: eventInquiries, venueName: venues.name })
      .from(eventInquiries)
      .leftJoin(venues, eq(venues.id, eventInquiries.venueId))
      .where(eq(eventInquiries.userId, userId))
      .orderBy(desc(eventInquiries.createdAt));
  }

  async insertWatch(row: typeof tableWatches.$inferInsert) {
    const [created] = await this.db.insert(tableWatches).values(row).returning();
    return created;
  }

  async table(id: string): Promise<TableRow | undefined> {
    const [row] = await this.db.select().from(tables).where(eq(tables.id, id));
    return row;
  }
}
