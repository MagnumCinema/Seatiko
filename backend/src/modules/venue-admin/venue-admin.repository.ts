import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, menuItems, orders, reservations, tables, users, venues, waiterCalls } from '../../database/schema/index.js';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type TableRow = typeof tables.$inferSelect;
export type MenuRow = typeof menuItems.$inferSelect;
export type VenueRow = typeof venues.$inferSelect;

/** What an owner changes at their venue: floor plan, menu, QR codes, booking rules. */
@Injectable()
export class VenueAdminRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** An application id stands for its published venue (resolveVenueIDLocked). */
  async resolveVenueId(id: string): Promise<string> {
    const [app] = await this.db.select({ venueId: applications.venueId }).from(applications).where(eq(applications.id, id));
    return app?.venueId || id;
  }

  async venue(id: string): Promise<VenueRow | undefined> {
    const [row] = await this.db.select().from(venues).where(eq(venues.id, id));
    return row;
  }

  async updateVenue(id: string, patch: Partial<typeof venues.$inferInsert>): Promise<void> {
    await this.db.update(venues).set(patch).where(eq(venues.id, id));
  }

  tablesOf(venueId: string, db: Database | Tx = this.db): Promise<TableRow[]> {
    return db.select().from(tables).where(eq(tables.venueId, venueId)).orderBy(asc(tables.number));
  }

  async upsertTables(tx: Tx, rows: Array<typeof tables.$inferInsert>): Promise<void> {
    for (const row of rows) {
      await tx
        .insert(tables)
        .values(row)
        .onConflictDoUpdate({ target: tables.id, set: { seats: row.seats, x: row.x, y: row.y, zone: row.zone } });
    }
  }

  /** Drops tables no longer in the layout, except seated or reserved ones. */
  async dropTablesExcept(tx: Tx, venueId: string, numbers: number[]): Promise<void> {
    await tx
      .delete(tables)
      .where(and(eq(tables.venueId, venueId), notInArray(tables.number, numbers.length ? numbers : [-1]), notInArray(tables.status, ['OCCUPIED', 'RESERVED'])));
  }

  async setQr(tx: Tx, tableId: string, qrToken: string): Promise<void> {
    await tx.update(tables).set({ qrToken }).where(eq(tables.id, tableId));
  }

  menuOf(venueId: string): Promise<MenuRow[]> {
    return this.db.select().from(menuItems).where(eq(menuItems.venueId, venueId));
  }

  async menuItem(id: string): Promise<MenuRow | undefined> {
    const [row] = await this.db.select().from(menuItems).where(eq(menuItems.id, id));
    return row;
  }

  async saveMenuItem(row: typeof menuItems.$inferInsert): Promise<MenuRow> {
    const [saved] = await this.db
      .insert(menuItems)
      .values(row)
      .onConflictDoUpdate({ target: menuItems.id, set: (({ id: _id, ...rest }) => rest)(row) })
      .returning();
    return saved;
  }

  async deleteMenuItem(id: string): Promise<void> {
    await this.db.delete(menuItems).where(eq(menuItems.id, id));
  }

  async setStopped(id: string, stopped: boolean): Promise<MenuRow> {
    const [row] = await this.db.update(menuItems).set({ stopped }).where(eq(menuItems.id, id)).returning();
    return row;
  }

  /** Counts for the owner dashboard. */
  async analytics(venueId: string) {
    const [byReservation, byOrder, tableRows, pending] = await Promise.all([
      this.db.select({ status: reservations.status, n: sql<number>`count(*)::int` }).from(reservations).where(eq(reservations.venueId, venueId)).groupBy(reservations.status),
      this.db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.venueId, venueId)).groupBy(orders.status),
      this.tablesOf(venueId),
      this.db.select({ n: sql<number>`count(*)::int` }).from(waiterCalls).where(and(eq(waiterCalls.venueId, venueId), eq(waiterCalls.status, 'PENDING'))),
    ]);
    return {
      reservationsByStatus: Object.fromEntries(byReservation.map((r) => [r.status, r.n])),
      ordersByStatus: Object.fromEntries(byOrder.map((r) => [r.status, r.n])),
      totalTables: tableRows.length,
      freeTables: tableRows.filter((t) => t.status === 'FREE').length,
      waiterCallsPending: pending[0]?.n ?? 0,
    };
  }

  /** Bookings at the owner's published venues (all venues for an admin), newest first. */
  ownerReservations(ownerId: string | undefined) {
    const owned = this.db.select({ id: applications.venueId }).from(applications).where(eq(applications.ownerUserId, ownerId ?? ''));
    return this.db
      .select({ r: reservations, venueName: venues.name, tableNumber: tables.number, guest: { displayName: users.displayName, firstName: users.firstName, lastName: users.lastName, email: users.email } })
      .from(reservations)
      .leftJoin(venues, eq(venues.id, reservations.venueId))
      .leftJoin(tables, eq(tables.id, reservations.tableId))
      .leftJoin(users, eq(users.id, reservations.userId))
      .where(ownerId ? inArray(reservations.venueId, owned) : undefined)
      .orderBy(desc(reservations.reservedFor));
  }
}
