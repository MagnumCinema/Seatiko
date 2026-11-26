import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import {
  applicationActivities,
  applications,
  menuItems,
  profileChangeRequests,
  staffMembers,
  tables,
  users,
  venueRoles,
  venues,
  waiterCalls,
  workShifts,
} from '../../database/schema/index.js';

export type ApplicationRow = typeof applications.$inferSelect;
export type ActivityRow = typeof applicationActivities.$inferSelect;
export type ChangeRow = typeof profileChangeRequests.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Db = Database | Tx;

/** Restaurant applications, their journal and profile changes; publishing creates the venue. */
@Injectable()
export class ApplicationsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async byId(id: string, db: Db = this.db): Promise<ApplicationRow | undefined> {
    const [row] = await db.select().from(applications).where(eq(applications.id, id));
    return row;
  }

  async lock(tx: Tx, id: string): Promise<ApplicationRow | undefined> {
    const [row] = await tx.select().from(applications).where(eq(applications.id, id)).for('update');
    return row;
  }

  byOwner(ownerId: string): Promise<ApplicationRow[]> {
    return this.db.select().from(applications).where(eq(applications.ownerUserId, ownerId)).orderBy(desc(applications.updatedAt));
  }

  all(status?: string): Promise<ApplicationRow[]> {
    return this.db.select().from(applications).where(status ? eq(applications.status, status) : undefined).orderBy(desc(applications.updatedAt));
  }

  async insert(db: Db, row: typeof applications.$inferInsert): Promise<ApplicationRow> {
    const [created] = await db.insert(applications).values(row).returning();
    return created;
  }

  async update(db: Db, id: string, patch: Partial<typeof applications.$inferInsert>): Promise<ApplicationRow> {
    const [row] = await db.update(applications).set(patch).where(eq(applications.id, id)).returning();
    return row;
  }

  async userRole(id: string, db: Db = this.db): Promise<string | undefined> {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
    return row?.role;
  }

  async record(db: Db, row: typeof applicationActivities.$inferInsert): Promise<void> {
    await db.insert(applicationActivities).values(row);
  }

  activity(appId: string): Promise<ActivityRow[]> {
    return this.db.select().from(applicationActivities).where(eq(applicationActivities.applicationId, appId)).orderBy(desc(applicationActivities.createdAt));
  }

  /** Deletes the application and its published venue with everything at it. */
  async remove(tx: Tx, app: ApplicationRow): Promise<void> {
    const venueIds = [app.id, ...(app.venueId ? [app.venueId] : [])];
    await tx.delete(staffMembers).where(inArray(staffMembers.venueId, venueIds));
    await tx.delete(workShifts).where(inArray(workShifts.venueId, venueIds));
    await tx.delete(venueRoles).where(inArray(venueRoles.venueId, venueIds));
    await tx.delete(waiterCalls).where(inArray(waiterCalls.venueId, venueIds));
    if (app.venueId) await tx.delete(venues).where(eq(venues.id, app.venueId)); // tables, menu, bookings, waitlist cascade
    await tx.delete(applications).where(eq(applications.id, app.id));
  }

  async insertChange(db: Db, row: typeof profileChangeRequests.$inferInsert): Promise<ChangeRow> {
    const [created] = await db.insert(profileChangeRequests).values(row).returning();
    return created;
  }

  changes(ownerId?: string): Promise<ChangeRow[]> {
    return this.db
      .select()
      .from(profileChangeRequests)
      .where(ownerId ? eq(profileChangeRequests.ownerUserId, ownerId) : undefined)
      .orderBy(desc(profileChangeRequests.createdAt));
  }

  async lockChange(tx: Tx, id: string): Promise<ChangeRow | undefined> {
    const [row] = await tx.select().from(profileChangeRequests).where(eq(profileChangeRequests.id, id)).for('update');
    return row;
  }

  async updateChange(tx: Tx, id: string, patch: Partial<typeof profileChangeRequests.$inferInsert>): Promise<ChangeRow> {
    const [row] = await tx.update(profileChangeRequests).set(patch).where(eq(profileChangeRequests.id, id)).returning();
    return row;
  }

  async insertVenue(tx: Tx, row: typeof venues.$inferInsert): Promise<void> {
    await tx.insert(venues).values(row);
  }

  async updateVenue(tx: Tx, id: string, patch: Partial<typeof venues.$inferInsert>): Promise<void> {
    await tx.update(venues).set(patch).where(eq(venues.id, id));
  }

  async insertTables(tx: Tx, rows: Array<typeof tables.$inferInsert>): Promise<void> {
    if (rows.length) await tx.insert(tables).values(rows);
  }

  /** Records made under the application id during onboarding move to the new venue. */
  async moveToVenue(tx: Tx, appId: string, venueId: string): Promise<void> {
    await tx.update(menuItems).set({ venueId }).where(eq(menuItems.venueId, appId));
    await tx.update(staffMembers).set({ venueId }).where(eq(staffMembers.venueId, appId));
    await tx.update(workShifts).set({ venueId }).where(eq(workShifts.venueId, appId));
    await tx.update(venueRoles).set({ venueId }).where(eq(venueRoles.venueId, appId));
  }
}
