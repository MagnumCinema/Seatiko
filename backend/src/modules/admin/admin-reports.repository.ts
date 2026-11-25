import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { applications, orders, profileChangeRequests, reservations, tables, users, venues, waiterCalls } from '../../database/schema/index.js';

/** Read-only reports for the admin console (they read across every area on purpose). */
@Injectable()
export class AdminReportsRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async overview() {
    const count = (q: Promise<Array<{ n: number }>>) => q.then((r) => r[0]?.n ?? 0);
    const n = sql<number>`count(*)::int`;
    const [roles, apps, res, ords, calls, changes] = await Promise.all([
      this.db.select({ role: users.role, n }).from(users).groupBy(users.role),
      this.db.select({ status: applications.status, n }).from(applications).groupBy(applications.status),
      this.db.select({ status: reservations.status, n }).from(reservations).groupBy(reservations.status),
      this.db.select({ status: orders.status, n, sum: sql<number>`coalesce(sum(${orders.total}), 0)::int` }).from(orders).groupBy(orders.status),
      count(this.db.select({ n }).from(waiterCalls).where(eq(waiterCalls.status, 'PENDING'))),
      count(this.db.select({ n }).from(profileChangeRequests).where(eq(profileChangeRequests.status, 'PENDING'))),
    ]);
    const by = <T extends { n: number }>(rows: T[], key: (r: T) => string) => Object.fromEntries(rows.map((r) => [key(r), r.n]));
    const role = by(roles, (r) => r.role);
    const app = by(apps, (r) => r.status);
    const resBy = by(res, (r) => r.status);
    const ordBy = by(ords, (r) => r.status);
    const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    return {
      users_total: total(role),
      guests_total: role.guest ?? 0,
      owners_total: role.restaurant ?? 0,
      staff_total: role.staff ?? 0,
      venues_published: app.PUBLISHED ?? 0,
      applications_pending: (app.SUBMITTED ?? 0) + (app.UNDER_REVIEW ?? 0) + (app.APPROVED ?? 0),
      reservations_active: (resBy.CONFIRMED ?? 0) + (resBy.CHECKED_IN ?? 0),
      reservations_total: total(resBy),
      orders_total: total(ordBy),
      orders_paid: ordBy.PAID ?? 0,
      revenue_paid_mdl: ords.find((o) => o.status === 'PAID')?.sum ?? 0,
      waiter_calls_pending: calls,
      change_requests_open: changes,
      reservations_by_status: resBy,
      orders_by_status: ordBy,
    };
  }

  people() {
    return this.db.select().from(users).orderBy(desc(users.createdAt));
  }

  companies() {
    return this.db
      .select({ app: applications, owner: { email: users.email, displayName: users.displayName, firstName: users.firstName, lastName: users.lastName } })
      .from(applications)
      .leftJoin(users, eq(users.id, applications.ownerUserId))
      .orderBy(desc(applications.updatedAt));
  }

  reservations() {
    return this.db
      .select({ r: reservations, venueName: venues.name, tableNumber: tables.number, guest: { email: users.email, displayName: users.displayName, firstName: users.firstName, lastName: users.lastName } })
      .from(reservations)
      .leftJoin(venues, eq(venues.id, reservations.venueId))
      .leftJoin(tables, eq(tables.id, reservations.tableId))
      .leftJoin(users, eq(users.id, reservations.userId))
      .orderBy(desc(reservations.reservedFor));
  }

  guests() {
    return this.db.select({ id: users.id, email: users.email, displayName: users.displayName, firstName: users.firstName, lastName: users.lastName }).from(users);
  }
}
