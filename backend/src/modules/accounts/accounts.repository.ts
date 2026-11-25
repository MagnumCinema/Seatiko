import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import {
  eventInquiries,
  notifications,
  orders,
  reservations,
  reservationTables,
  tables,
  tableWatches,
  users,
  waitlistEntries,
} from '../../database/schema/index.js';

export type UserRecord = typeof users.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cancelled preorder of an erased account, for the staff notification. */
export type CancelledPreorder = { orderId: string; venueId: string; reservationId: string; reservedFor: string };

@Injectable()
export class AccountsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async byId(id: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async byEmail(email: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
    return row;
  }

  async emailTaken(email: string, exceptId = ''): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, exceptId)));
    return Boolean(row);
  }

  async insert(row: typeof users.$inferInsert): Promise<UserRecord> {
    const [created] = await this.db.insert(users).values(row).returning();
    return created;
  }

  async update(id: string, patch: Partial<typeof users.$inferInsert>): Promise<UserRecord | undefined> {
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** Clears every personal field of the user row; no password matches afterwards. */
  async anonymize(tx: Tx, userId: string, email: string, at: string): Promise<void> {
    await tx
      .update(users)
      .set({
        email,
        passwordHash: '',
        phone: '',
        firstName: '',
        lastName: '',
        displayName: '',
        dietPreferences: [],
        favoriteVenues: [],
        avatarUrl: '',
        avatarKey: '',
        adultPreorderAllowed: false,
        adultVerification: null,
        deletedAt: at,
        updatedAt: at,
      })
      .where(eq(users.id, userId));
  }

  /**
   * GDPR erasure of a guest's data in other tables (one transaction with the user row):
   * upcoming reservations cancelled and their tables and preorders released, contact
   * data stripped from waitlist entries and event requests, watches and notifications
   * dropped. Returns the cancelled reservations and preorders.
   */
  async eraseGuestData(tx: Tx, userId: string, now: Date): Promise<{ cancelled: number; preorders: CancelledPreorder[] }> {
    const nowIso = now.toISOString();
    const upcoming = await tx
      .update(reservations)
      .set({ status: 'CANCELLED', notes: '', updatedAt: nowIso })
      .where(and(eq(reservations.userId, userId), eq(reservations.status, 'CONFIRMED'), gt(reservations.reservedFor, new Date(now.getTime() - 2 * 3600_000).toISOString())))
      .returning({ id: reservations.id, reservedFor: reservations.reservedFor });
    await tx.update(reservations).set({ notes: '' }).where(eq(reservations.userId, userId));

    const ids = upcoming.map((r) => r.id);
    let preorders: CancelledPreorder[] = [];
    if (ids.length) {
      await tx.update(reservationTables).set({ active: false }).where(inArray(reservationTables.reservationId, ids));
      await tx
        .update(tables)
        .set({ status: 'FREE', reservedFor: null, reservationId: null })
        .where(inArray(tables.reservationId, ids));
      const cancelled = await tx
        .update(orders)
        .set({ status: 'CANCELLED', updatedAt: nowIso })
        .where(and(eq(orders.preorder, true), inArray(orders.reservationId, ids), or(eq(orders.status, 'SUBMITTED'), eq(orders.status, 'DRAFT'))))
        .returning({ orderId: orders.id, venueId: orders.venueId, reservationId: orders.reservationId });
      const when = new Map(upcoming.map((r) => [r.id, r.reservedFor]));
      preorders = cancelled.map((o) => ({ ...o, reservedFor: when.get(o.reservationId) ?? nowIso }));
    }

    await tx
      .update(waitlistEntries)
      .set({ guestName: '', phone: '', status: sql`case when ${waitlistEntries.status} in ('WAITING', 'READY') then 'LEFT' else ${waitlistEntries.status} end` })
      .where(eq(waitlistEntries.userId, userId));
    await tx.update(eventInquiries).set({ contactName: '', contactPhone: '', notes: '' }).where(eq(eventInquiries.userId, userId));
    await tx.delete(tableWatches).where(eq(tableWatches.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    return { cancelled: upcoming.length, preorders };
  }
}
