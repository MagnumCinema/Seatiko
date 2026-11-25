import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, notifications, staffMembers, users, venues } from '../../database/schema/index.js';

export type NotificationRow = typeof notifications.$inferSelect & { venueName: { ru: string; en: string; ro: string } | null };
/** A Drizzle handle or an open transaction. */
export type Db = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export const MAX_NOTIFICATIONS_PER_USER = 200;

@Injectable()
export class NotificationsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async insert(rows: Array<typeof notifications.$inferInsert>, tx: Db = this.db): Promise<void> {
    if (!rows.length) return;
    await tx.insert(notifications).values(rows);
    // Keep the newest MAX_NOTIFICATIONS_PER_USER per recipient, as the Go store does.
    const ids = [...new Set(rows.map((r) => r.userId))];
    await tx.execute(sql`
      delete from ${notifications} n using (
        select id, row_number() over (partition by user_id order by created_at desc, id desc) as rn
        from ${notifications} where user_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      ) ranked
      where n.id = ranked.id and ranked.rn > ${MAX_NOTIFICATIONS_PER_USER}`);
  }

  /** Newest first, with the venue name for display. */
  list(userId: string, unreadOnly: boolean, limit: number): Promise<NotificationRow[]> {
    return this.db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        kind: notifications.kind,
        venueId: notifications.venueId,
        reservationId: notifications.reservationId,
        orderId: notifications.orderId,
        at: notifications.at,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        venueName: venues.name,
      })
      .from(notifications)
      .leftJoin(venues, eq(venues.id, notifications.venueId))
      .where(and(eq(notifications.userId, userId), unreadOnly ? isNull(notifications.readAt) : undefined))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }

  async markRead(userId: string, ids: string[], at: string): Promise<number> {
    const res = await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids.length ? inArray(notifications.id, ids) : undefined))
      .returning({ id: notifications.id });
    return res.length;
  }

  async venueName(venueId: string) {
    if (!venueId) return null;
    const [row] = await this.db.select({ name: venues.name }).from(venues).where(eq(venues.id, venueId));
    return row?.name ?? null;
  }

  /** Owners of the published venue and its active staff (by user id or invited email). */
  async venueStaffRecipients(venueId: string, tx: Db = this.db): Promise<string[]> {
    const owners = await tx
      .select({ id: applications.ownerUserId })
      .from(applications)
      .where(and(eq(applications.venueId, venueId), eq(applications.status, 'PUBLISHED')));
    const staff = await tx
      .select({ userId: staffMembers.userId, matched: users.id })
      .from(staffMembers)
      .leftJoin(users, and(eq(staffMembers.userId, ''), sql`lower(${users.email}) = lower(${staffMembers.email})`))
      .where(and(eq(staffMembers.venueId, venueId), eq(staffMembers.status, 'ACTIVE')));
    return [...owners.map((o) => o.id), ...staff.map((s) => s.userId || s.matched || '')].filter(Boolean);
  }
}
