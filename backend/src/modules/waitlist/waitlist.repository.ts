import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { tables, venues, waitlistEntries } from '../../database/schema/index.js';

export type EntryRow = typeof waitlistEntries.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Db = Database | Tx;

@Injectable()
export class WaitlistRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async byId(id: string, db: Db = this.db): Promise<EntryRow | undefined> {
    const [row] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, id));
    return row;
  }

  async lock(tx: Tx, id: string): Promise<EntryRow | undefined> {
    const [row] = await tx.select().from(waitlistEntries).where(eq(waitlistEntries.id, id)).for('update');
    return row;
  }

  async insert(row: typeof waitlistEntries.$inferInsert): Promise<void> {
    await this.db.insert(waitlistEntries).values(row);
  }

  async update(tx: Tx, id: string, patch: Partial<typeof waitlistEntries.$inferInsert>): Promise<void> {
    await tx.update(waitlistEntries).set(patch).where(eq(waitlistEntries.id, id));
  }

  async hasActive(userId: string, venueId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.userId, userId), eq(waitlistEntries.venueId, venueId), inArray(waitlistEntries.status, ['WAITING', 'READY'])))
      .limit(1);
    return Boolean(row);
  }

  byUser(userId: string): Promise<EntryRow[]> {
    return this.db.select().from(waitlistEntries).where(eq(waitlistEntries.userId, userId)).orderBy(desc(waitlistEntries.createdAt));
  }

  /** Active entries of the venue plus the ones closed after `cutoff`. */
  forVenue(venueId: string, cutoff: Date): Promise<EntryRow[]> {
    return this.db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.venueId, venueId), or(inArray(waitlistEntries.status, ['WAITING', 'READY']), gt(waitlistEntries.createdAt, cutoff.toISOString()))));
  }

  /** WAITING queues (in join order) of these venues, for positions. */
  waitingOf(venueIds: string[]): Promise<Array<{ id: string; venueId: string }>> {
    if (!venueIds.length) return Promise.resolve([]);
    return this.db
      .select({ id: waitlistEntries.id, venueId: waitlistEntries.venueId })
      .from(waitlistEntries)
      .where(and(inArray(waitlistEntries.venueId, venueIds), eq(waitlistEntries.status, 'WAITING')))
      .orderBy(asc(waitlistEntries.createdAt));
  }

  /** Venue facts for enrichment: name, free tables, hold minutes. */
  venueFacts(venueIds: string[]) {
    if (!venueIds.length) return Promise.resolve([]);
    return this.db
      .select({
        id: venues.id,
        name: venues.name,
        holdMinutes: venues.holdMinutes,
        freeTables: sql<number>`(select count(*)::int from "tables" ft where ft.venue_id = "venues"."id" and ft.status = 'FREE')`,
      })
      .from(venues)
      .where(inArray(venues.id, venueIds));
  }

  tableNumbers(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.db.select({ id: tables.id, number: tables.number }).from(tables).where(inArray(tables.id, ids));
  }

  async lockTable(tx: Tx, id: string) {
    const [row] = await tx.select().from(tables).where(eq(tables.id, id)).for('update');
    return row;
  }

  async setTable(tx: Tx, id: string, patch: Partial<typeof tables.$inferInsert>): Promise<void> {
    await tx.update(tables).set(patch).where(eq(tables.id, id));
  }
}
