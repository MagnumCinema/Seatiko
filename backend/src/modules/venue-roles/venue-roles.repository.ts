import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, gte, inArray, or } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, staffMembers, venueRoles, venues, workShifts } from '../../database/schema/index.js';

export type RoleRow = typeof venueRoles.$inferSelect;
export type Db = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Venue team roles. */
@Injectable()
export class VenueRolesRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  roles(venueId: string, db: Db = this.db): Promise<RoleRow[]> {
    return db.select().from(venueRoles).where(eq(venueRoles.venueId, venueId)).orderBy(asc(venueRoles.position), asc(venueRoles.createdAt));
  }

  rolesOf(venueIds: string[]): Promise<RoleRow[]> {
    if (!venueIds.length) return Promise.resolve([]);
    return this.db.select().from(venueRoles).where(inArray(venueRoles.venueId, venueIds));
  }

  async role(id: string): Promise<RoleRow | undefined> {
    const [row] = await this.db.select().from(venueRoles).where(eq(venueRoles.id, id));
    return row;
  }

  /** Inserts roles; one a concurrent request already added (same key) is skipped. */
  async insertRoles(rows: Array<typeof venueRoles.$inferInsert>, db: Db = this.db): Promise<void> {
    if (rows.length) await db.insert(venueRoles).values(rows).onConflictDoNothing();
  }

  async updateRole(id: string, patch: Partial<typeof venueRoles.$inferInsert>): Promise<RoleRow> {
    const [row] = await this.db.update(venueRoles).set(patch).where(eq(venueRoles.id, id)).returning();
    return row;
  }

  /** Moves the role's members and their upcoming shifts to another role, then deletes it. */
  async deleteRole(role: RoleRow, reassignTo: string | undefined, today: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (reassignTo) {
        await tx.update(staffMembers).set({ role: reassignTo }).where(and(eq(staffMembers.venueId, role.venueId), eq(staffMembers.role, role.key)));
        await tx
          .update(workShifts)
          .set({ role: reassignTo })
          .where(and(eq(workShifts.venueId, role.venueId), eq(workShifts.role, role.key), gte(workShifts.date, today)));
      }
      await tx.delete(venueRoles).where(eq(venueRoles.id, role.id));
    });
  }

  async membersWithRole(venueId: string, key: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(staffMembers).where(and(eq(staffMembers.venueId, venueId), eq(staffMembers.role, key)));
    return row?.n ?? 0;
  }

  /** Role keys the team of a venue uses. */
  async usedKeys(venueId: string, db: Db = this.db): Promise<string[]> {
    const rows = await db.selectDistinct({ role: staffMembers.role }).from(staffMembers).where(eq(staffMembers.venueId, venueId));
    return rows.map((r) => r.role);
  }

  /** Venue type of a published venue, else of the application (a draft's id is its venue id). */
  async venueType(venueId: string, db: Db = this.db): Promise<string> {
    const [venue] = await db.select({ type: venues.venueType }).from(venues).where(eq(venues.id, venueId));
    if (venue) return venue.type;
    const [app] = await db
      .select({ type: applications.venueType })
      .from(applications)
      .where(or(eq(applications.id, venueId), eq(applications.venueId, venueId)))
      .limit(1);
    return app?.type ?? '';
  }
}
