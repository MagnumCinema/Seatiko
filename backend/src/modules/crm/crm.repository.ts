import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gte, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import {
  applicationActivities,
  applications,
  cities,
  eventInquiries,
  menuItems,
  orders,
  reservations,
  reservationTables,
  staffMembers,
  tables,
  users,
  workShifts,
} from '../../database/schema/index.js';

/** Restaurant figures the CRM shows on a company. */
export type VenueStats = { tables: number; seats: number; menuItems: number; reservations30d: number; orders30d: number; revenue30d: number };

export type UserRow = typeof users.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;

/**
 * What the CRM projection reads (every area, on purpose: it mirrors Seatiko into
 * Twenty) and the few edits Twenty may send back (contacts, descriptive venue
 * fields, booking status — never moderation, publication or ownership).
 */
@Injectable()
export class CrmRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  users(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(asc(users.createdAt));
  }

  applications(): Promise<ApplicationRow[]> {
    return this.db.select().from(applications).orderBy(asc(applications.createdAt));
  }

  activities() {
    return this.db.select({ applicationId: applicationActivities.applicationId, action: applicationActivities.action, createdAt: applicationActivities.createdAt }).from(applicationActivities);
  }

  /** Staff memberships: who works where, in which role, with which access. */
  staff() {
    return this.db
      .select({ id: staffMembers.id, userId: staffMembers.userId, name: staffMembers.name, venueId: staffMembers.venueId, role: staffMembers.role, status: staffMembers.status, createdAt: staffMembers.createdAt })
      .from(staffMembers);
  }

  shifts() {
    return this.db.select().from(workShifts).orderBy(asc(workShifts.date), asc(workShifts.startTime));
  }

  eventInquiries() {
    return this.db.select().from(eventInquiries).orderBy(asc(eventInquiries.createdAt));
  }

  /** Tables, seats, menu, bookings and orders of these venues (bookings and orders since `since`). */
  async venueStats(venueIds: string[], since: string): Promise<Map<string, VenueStats>> {
    const out = new Map<string, VenueStats>(venueIds.map((id) => [id, { tables: 0, seats: 0, menuItems: 0, reservations30d: 0, orders30d: 0, revenue30d: 0 }]));
    if (!venueIds.length) return out;
    const [tableRows, menuRows, bookingRows, orderRows] = await Promise.all([
      this.db
        .select({ venueId: tables.venueId, n: sql<number>`count(*)::int`, seats: sql<number>`coalesce(sum(${tables.seats}), 0)::int` })
        .from(tables)
        .where(inArray(tables.venueId, venueIds))
        .groupBy(tables.venueId),
      this.db.select({ venueId: menuItems.venueId, n: sql<number>`count(*)::int` }).from(menuItems).where(inArray(menuItems.venueId, venueIds)).groupBy(menuItems.venueId),
      this.db
        .select({ venueId: reservations.venueId, n: sql<number>`count(*)::int` })
        .from(reservations)
        .where(and(inArray(reservations.venueId, venueIds), gte(reservations.createdAt, since), ne(reservations.status, 'CANCELLED')))
        .groupBy(reservations.venueId),
      this.db
        .select({
          venueId: orders.venueId,
          n: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} in ('PAID', 'CLOSED')), 0)::int`,
        })
        .from(orders)
        .where(and(inArray(orders.venueId, venueIds), gte(orders.createdAt, since), notInArray(orders.status, ['CANCELLED', 'DRAFT'])))
        .groupBy(orders.venueId),
    ]);
    for (const r of tableRows) Object.assign(out.get(r.venueId)!, { tables: r.n, seats: r.seats });
    for (const r of menuRows) out.get(r.venueId)!.menuItems = r.n;
    for (const r of bookingRows) out.get(r.venueId)!.reservations30d = r.n;
    for (const r of orderRows) Object.assign(out.get(r.venueId)!, { orders30d: r.n, revenue30d: r.revenue });
    return out;
  }

  /** Banquet request status set in the CRM (the site has no control for it). */
  async setInquiryStatusFromCrm(id: string, status: string, at: string): Promise<'ok' | 'missing'> {
    const [row] = await this.db.update(eventInquiries).set({ status, updatedAt: at }).where(eq(eventInquiries.id, id)).returning({ id: eventInquiries.id });
    return row ? 'ok' : 'missing';
  }

  cities() {
    return this.db.select({ id: cities.id, name: cities.name }).from(cities);
  }

  reservations() {
    return this.db
      .select({ r: reservations, tableNumber: tables.number })
      .from(reservations)
      .leftJoin(tables, eq(tables.id, reservations.tableId))
      .orderBy(asc(reservations.createdAt));
  }

  /** Contact fields from the CRM; a deleted account never gets its data back. */
  async updateUserFromCrm(id: string, p: { firstName: string; lastName: string; email: string; phone: string; locale: string }, at: string): Promise<'ok' | 'missing' | 'email_taken'> {
    const [u] = await this.db.select().from(users).where(eq(users.id, id));
    if (!u || u.deletedAt) return 'missing';
    if (p.email) {
      const [taken] = await this.db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = lower(${p.email})`, ne(users.id, id)));
      if (taken) return 'email_taken';
    }
    const firstName = p.firstName || u.firstName;
    const lastName = p.lastName || u.lastName;
    await this.db
      .update(users)
      .set({
        ...(p.email ? { email: p.email } : {}),
        firstName,
        lastName,
        ...(p.phone ? { phone: p.phone } : {}),
        ...(['ru', 'en', 'ro'].includes(p.locale) ? { locale: p.locale } : {}),
        ...(`${firstName} ${lastName}`.trim() ? { displayName: `${firstName} ${lastName}`.trim() } : {}),
        updatedAt: at,
      })
      .where(eq(users.id, id));
    return 'ok';
  }

  async application(id: string): Promise<ApplicationRow | undefined> {
    const [row] = await this.db.select().from(applications).where(eq(applications.id, id));
    return row;
  }

  /** Descriptive fields edited in the CRM, journaled as CRM_PROFILE_UPDATED. */
  async updateApplicationFromCrm(id: string, patch: Partial<typeof applications.$inferInsert>, changed: string[], at: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(applications).set({ ...patch, updatedAt: at }).where(eq(applications.id, id));
      await tx.insert(applicationActivities).values({ id: randomUUID(), applicationId: id, actorUserId: 'twenty-crm', actorRole: 'system', action: 'CRM_PROFILE_UPDATED', changedFields: changed, createdAt: at });
    });
  }

  /** Booking status set in the CRM; a cancellation frees the table and stops blocking it. */
  async setReservationStatusFromCrm(id: string, status: string, at: string): Promise<'ok' | 'missing'> {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(reservations).where(eq(reservations.id, id)).for('update');
      if (!r) return 'missing';
      if (r.status === status) return 'ok';
      await tx
        .update(reservations)
        .set({ status, updatedAt: at, ...(status === 'CHECKED_IN' && !r.arrivalConfirmedAt ? { arrivalConfirmedAt: at } : {}) })
        .where(eq(reservations.id, id));
      const active = status === 'CONFIRMED' || status === 'CHECKED_IN';
      await tx.update(reservationTables).set({ active }).where(eq(reservationTables.reservationId, id));
      if (status === 'CANCELLED') {
        await tx.update(tables).set({ status: 'FREE', reservedFor: null, reservationId: null }).where(eq(tables.reservationId, id));
      }
      return 'ok';
    });
  }
}
