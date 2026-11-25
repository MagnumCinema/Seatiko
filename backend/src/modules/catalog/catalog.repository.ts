import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, cities, collections, menuItems, reservations, reservationTables, tables, venues, waitlistEntries } from '../../database/schema/index.js';

export type CityRecord = typeof cities.$inferSelect;
export type VenueRecord = typeof venues.$inferSelect & { freeTables: number };
export type TableRecord = typeof tables.$inferSelect;
export type MenuItemRecord = typeof menuItems.$inferSelect;
export type ApplicationRecord = typeof applications.$inferSelect;

/** Active booking of a table: the window it blocks, from reservation_tables. */
export type TableBlock = { reservationId: string; tableId: string; from: string; until: string };

// Qualified by hand: Drizzle drops table names inside select fields, and "id" would be ambiguous.
const freeTables = sql<number>`(select count(*)::int from "tables" ft where ft.venue_id = "venues"."id" and ft.status = 'FREE')`.as('free_tables');

/** Read queries of the public catalog. No rules here. */
@Injectable()
export class CatalogRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  listCities(): Promise<CityRecord[]> {
    return this.db.select().from(cities).orderBy(asc(cities.id));
  }

  async getCity(id: string): Promise<CityRecord | undefined> {
    const [row] = await this.db.select().from(cities).where(eq(cities.id, id));
    return row;
  }

  listVenues(cityId?: string): Promise<VenueRecord[]> {
    return this.db
      .select({ ...venueColumns(), freeTables })
      .from(venues)
      .where(cityId ? eq(venues.cityId, cityId) : undefined)
      .orderBy(asc(venues.id));
  }

  async getVenue(id: string): Promise<VenueRecord | undefined> {
    const [row] = await this.db.select({ ...venueColumns(), freeTables }).from(venues).where(eq(venues.id, id));
    return row;
  }

  async getApplication(id: string): Promise<ApplicationRecord | undefined> {
    const [row] = await this.db.select().from(applications).where(eq(applications.id, id));
    return row;
  }

  /** Venue ids that have at least one table with seats (bookable on the map). */
  async bookableVenueIds(): Promise<Set<string>> {
    const rows = await this.db.selectDistinct({ id: tables.venueId }).from(tables).where(sql`${tables.seats} > 0`);
    return new Set(rows.map((r) => r.id));
  }

  listTables(venueId: string): Promise<TableRecord[]> {
    return this.db.select().from(tables).where(eq(tables.venueId, venueId)).orderBy(asc(tables.number));
  }

  listTablesOf(venueIds: string[]): Promise<TableRecord[]> {
    if (!venueIds.length) return Promise.resolve([]);
    return this.db.select().from(tables).where(inArray(tables.venueId, venueIds));
  }

  /** Dishes on sale (not stopped). */
  listMenu(venueId: string): Promise<MenuItemRecord[]> {
    return this.db.select().from(menuItems).where(and(eq(menuItems.venueId, venueId), eq(menuItems.stopped, false)));
  }

  listCollections() {
    return this.db.select().from(collections).orderBy(asc(collections.position));
  }

  /** Active (confirmed / checked-in) bookings of these tables overlapping [from, until). */
  async activeBlocks(tableIds: string[], from: Date, until: Date): Promise<TableBlock[]> {
    if (!tableIds.length) return [];
    const range = `[${from.toISOString()},${until.toISOString()})`;
    return this.db
      .select({
        reservationId: reservationTables.reservationId,
        tableId: reservationTables.tableId,
        from: sql<string>`lower(${reservationTables.blocks})::text`,
        until: sql<string>`upper(${reservationTables.blocks})::text`,
      })
      .from(reservationTables)
      .where(and(inArray(reservationTables.tableId, tableIds), eq(reservationTables.active, true), sql`${reservationTables.blocks} && ${range}::tstzrange`));
  }

  /** Reservations shown on the public board (not cancelled / no-show), with their primary table. */
  scheduleReservations(venueId: string) {
    return this.db
      .select({
        id: reservations.id,
        tableId: reservations.tableId,
        tableNumber: tables.number,
        reservedFor: reservations.reservedFor,
        expectedArrival: reservations.expectedArrival,
        durationMin: reservations.durationMin,
      })
      .from(reservations)
      .leftJoin(tables, eq(tables.id, reservations.tableId))
      .where(and(eq(reservations.venueId, venueId), sql`${reservations.status} not in ('CANCELLED', 'NO_SHOW')`));
  }

  async waitingCount(venueId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.venueId, venueId), eq(waitlistEntries.status, 'WAITING')));
    return row?.n ?? 0;
  }
}

const venueColumns = () => getTableColumns(venues);
