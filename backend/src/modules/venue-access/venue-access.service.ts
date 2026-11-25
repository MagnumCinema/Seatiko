import { Global, Injectable, Module } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, or, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, staffMembers, users } from '../../database/schema/index.js';

/** How a user may act for a venue, as staffActorLocked in Go. */
export type StaffRole = 'admin' | 'manager' | 'waiter';
export type StaffActor = { user: typeof users.$inferSelect; role: StaffRole };

/**
 * Who may work a venue: admins, the owner (restaurant role, own application or its
 * published venue) and active staff members (by user id or invited email).
 */
@Injectable()
export class VenueAccessService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The owner's application or its venue is this venue (ownerCanManageVenueLocked). */
  async ownerCanManage(ownerId: string, venueId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.ownerUserId, ownerId), or(eq(applications.venueId, venueId), eq(applications.id, venueId))))
      .limit(1);
    return Boolean(row);
  }

  async isActiveStaff(user: { id: string; email: string }, venueId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.venueId, venueId),
          eq(staffMembers.status, 'ACTIVE'),
          or(eq(staffMembers.userId, user.id), sql`lower(${staffMembers.email}) = lower(${user.email})`),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** The user and their role at the venue, or undefined when they may not act there. */
  async staffActor(userId: string, venueId: string): Promise<StaffActor | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) return undefined;
    if (user.role === 'admin') return { user, role: 'admin' };
    if (user.role === 'restaurant' && (await this.ownerCanManage(userId, venueId))) return { user, role: 'manager' };
    if (await this.isActiveStaff(user, venueId)) return { user, role: 'waiter' };
    return undefined;
  }
}

/** Display name of a staff member for audits (staffDisplayName in Go). */
export function staffDisplayName(u: { displayName: string; firstName: string; lastName: string; email: string }): string {
  return u.displayName.trim() || `${u.firstName} ${u.lastName}`.trim() || u.email;
}

@Global()
@Module({ providers: [VenueAccessService], exports: [VenueAccessService] })
export class VenueAccessModule {}
