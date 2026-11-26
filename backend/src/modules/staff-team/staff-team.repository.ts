import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { staffMembers, users, workShifts } from '../../database/schema/index.js';

export type MemberRow = typeof staffMembers.$inferSelect;
export type ShiftRow = typeof workShifts.$inferSelect;
export type UserRow = typeof users.$inferSelect;

/** Venue team and its work schedule. */
@Injectable()
export class StaffTeamRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async userByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
    return row;
  }

  async user(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  /** Guests who join a team become staff; owners and admins keep their role. */
  async makeStaff(userId: string, at: string): Promise<void> {
    await this.db.update(users).set({ role: 'staff', updatedAt: at }).where(and(eq(users.id, userId), eq(users.role, 'guest')));
  }

  async member(id: string): Promise<MemberRow | undefined> {
    const [row] = await this.db.select().from(staffMembers).where(eq(staffMembers.id, id));
    return row;
  }

  async insertMember(row: typeof staffMembers.$inferInsert): Promise<MemberRow> {
    const [created] = await this.db.insert(staffMembers).values(row).returning();
    return created;
  }

  async updateMember(id: string, patch: Partial<typeof staffMembers.$inferInsert>): Promise<MemberRow> {
    const [row] = await this.db.update(staffMembers).set(patch).where(eq(staffMembers.id, id)).returning();
    return row;
  }

  async deleteMember(id: string): Promise<void> {
    await this.db.delete(staffMembers).where(eq(staffMembers.id, id));
  }

  /** The team with display names of linked accounts. */
  team(venueId: string) {
    return this.db
      .select({ m: staffMembers, displayName: users.displayName })
      .from(staffMembers)
      .leftJoin(users, eq(users.id, staffMembers.userId))
      .where(eq(staffMembers.venueId, venueId));
  }

  /** Memberships of a user (by id or invited email). */
  membershipsOf(user: { id: string; email: string }): Promise<MemberRow[]> {
    return this.db
      .select()
      .from(staffMembers)
      .where(or(eq(staffMembers.userId, user.id), sql`lower(${staffMembers.email}) = lower(${user.email})`));
  }

  async shift(id: string): Promise<ShiftRow | undefined> {
    const [row] = await this.db.select().from(workShifts).where(eq(workShifts.id, id));
    return row;
  }

  /** Pending or confirmed shifts of a staff member on a day (for overlap checks). */
  activeShiftsOn(venueId: string, staffId: string, date: string, exceptId = ''): Promise<ShiftRow[]> {
    return this.db
      .select()
      .from(workShifts)
      .where(
        and(
          eq(workShifts.venueId, venueId),
          eq(workShifts.staffId, staffId),
          eq(workShifts.date, date),
          inArray(workShifts.status, ['PENDING', 'CONFIRMED']),
          ne(workShifts.id, exceptId),
        ),
      );
  }

  shiftsOf(venueId: string, role?: string): Promise<ShiftRow[]> {
    return this.db
      .select()
      .from(workShifts)
      .where(and(eq(workShifts.venueId, venueId), role ? sql`lower(${workShifts.role}) = lower(${role})` : undefined))
      .orderBy(asc(workShifts.date), asc(workShifts.startTime));
  }

  shiftsOfMembers(memberIds: string[]): Promise<ShiftRow[]> {
    if (!memberIds.length) return Promise.resolve([]);
    return this.db.select().from(workShifts).where(inArray(workShifts.staffId, memberIds)).orderBy(asc(workShifts.date), asc(workShifts.startTime));
  }

  async insertShift(row: typeof workShifts.$inferInsert): Promise<ShiftRow> {
    const [created] = await this.db.insert(workShifts).values(row).returning();
    return created;
  }

  async updateShift(id: string, patch: Partial<typeof workShifts.$inferInsert>): Promise<ShiftRow> {
    const [row] = await this.db.update(workShifts).set(patch).where(eq(workShifts.id, id)).returning();
    return row;
  }

  /** Upcoming (today and later) shifts of a member take their new role. */
  async setUpcomingShiftsRole(staffId: string, role: string, today: string): Promise<void> {
    await this.db.update(workShifts).set({ role }).where(and(eq(workShifts.staffId, staffId), gte(workShifts.date, today)));
  }

  async deleteShift(id: string): Promise<void> {
    await this.db.delete(workShifts).where(eq(workShifts.id, id));
  }
}
