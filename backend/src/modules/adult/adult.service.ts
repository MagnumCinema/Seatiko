import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { Clock, dbDate, formatDbTime } from '../../core/time/time.js';
import type { Database } from '../../database/database.module.js';
import { adultPermissionLog, orders, reservations, users, type AdultVerification } from '../../database/schema/index.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { presentOrder } from '../orders/order.presenter.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { staffDisplayName, VenueAccessService } from '../venue-access/venue-access.service.js';

/** Staff may confirm 18+ only during (or right after) the guest's visit. */
const VISIT_WINDOW_MS = 12 * 3600_000;
const ID_TYPES = ['id_card', 'passport', 'other'];
const PENDING = 'PENDING_AGE_CHECK';

type UserRow = typeof users.$inferSelect;
type LogRow = typeof adultPermissionLog.$inferSelect;

/** What staff see about a guest's 18+ permission (no other personal data). */
const adultStatus = (u: UserRow) => ({ user_id: u.id, adult_preorder_allowed: u.adultPreorderAllowed, adult_verification: u.adultVerification ?? null });

function presentLog(e: LogRow) {
  return {
    id: e.id,
    user_id: e.userId,
    action: e.action,
    staff_id: e.staffId,
    staff_role: e.staffRole,
    staff_display_name: e.staffDisplayName,
    venue_id: e.venueId,
    ...(e.reservationId ? { reservation_id: e.reservationId } : {}),
    id_document_checked: e.idDocumentChecked,
    ...(e.idDocumentType ? { id_document_type: e.idDocumentType } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    created_at: formatDbTime(e.createdAt),
  };
}

/**
 * 18+ preorders (APP_LOGIC §8.4): staff grant after an in-person ID check, the owner or
 * an admin revokes, every change is audited, 18+ lines are checked again when served.
 */
@Injectable()
export class AdultService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly access: VenueAccessService,
    private readonly orders: OrdersRepository,
    private readonly catalog: CatalogService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  async grant(staffUserId: string, reservationId: string, idChecked: boolean, idType: string) {
    const [r] = await this.db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!r) throw notFound('not_found');
    const actor = await this.access.staffActor(staffUserId, r.venueId);
    if (!actor) throw forbidden();
    if (!idChecked) throw badRequest('id_document_required');
    if (!ID_TYPES.includes(idType)) throw badRequest('invalid_id_document_type');
    const [guest] = await this.db.select().from(users).where(eq(users.id, r.userId));
    if (!guest) throw notFound('not_found');
    if (guest.id === actor.user.id) throw forbidden();
    const now = this.clock.now();
    if (r.status !== 'CHECKED_IN' || dbDate(r.reservedFor).getTime() < now.getTime() - VISIT_WINDOW_MS) throw conflict('visit_required');

    const name = staffDisplayName(actor.user);
    const verification: AdultVerification = {
      verified_at: formatDbTime(now.toISOString()),
      verified_by_staff_id: actor.user.id,
      verified_by_staff_role: actor.role,
      verified_by_staff_display_name: name,
      verified_at_venue_id: r.venueId,
      id_document_checked: true,
      id_document_type: idType,
    };
    let publish: () => void = () => {};
    const updated = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({ adultPreorderAllowed: true, adultVerification: verification, updatedAt: now.toISOString() })
        .where(eq(users.id, guest.id))
        .returning();
      await tx.insert(adultPermissionLog).values({
        id: randomUUID(),
        userId: guest.id,
        action: 'GRANT',
        staffId: actor.user.id,
        staffRole: actor.role,
        staffDisplayName: name,
        venueId: r.venueId,
        reservationId: r.id,
        idDocumentChecked: true,
        idDocumentType: idType,
        createdAt: now.toISOString(),
      });
      publish = await this.notifications.notify('ADULT_GRANTED', [guest.id], { venueId: r.venueId, reservationId: r.id }, tx);
      return u;
    });
    publish();
    return adultStatus(updated);
  }

  /** Only the owner (manager) or an admin; the guest must have booked at the venue (admins: any guest). */
  async revoke(staffUserId: string, venueId: string, guestId: string, reason: string) {
    if (!(await this.catalog.publishedVenue(venueId))) throw notFound('not_found');
    const actor = await this.access.staffActor(staffUserId, venueId);
    if (!actor || actor.role === 'waiter') throw forbidden();
    const [guest] = await this.db.select().from(users).where(eq(users.id, guestId));
    if (!guest) throw notFound('not_found');
    if (actor.role !== 'admin') {
      const [visit] = await this.db.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.userId, guestId), eq(reservations.venueId, venueId))).limit(1);
      if (!visit) throw notFound('not_found');
    }
    if (!guest.adultPreorderAllowed) return adultStatus(guest);

    const now = this.clock.now().toISOString();
    const publish: Array<() => void> = [];
    const updated = await this.db.transaction(async (tx) => {
      const verification = guest.adultVerification ? { ...guest.adultVerification, revoked_at: formatDbTime(now), revoked_by_staff_id: actor.user.id } : null;
      const [u] = await tx.update(users).set({ adultPreorderAllowed: false, adultVerification: verification, updatedAt: now }).where(eq(users.id, guestId)).returning();
      // 18+ lines leave the guest's preorders the kitchen has not started.
      for (const o of await this.orders.load(and(eq(orders.preorder, true), eq(orders.userId, guestId), eq(orders.status, 'SUBMITTED')), tx)) {
        const kept = o.items.filter((it) => !it.requiresAge18);
        if (kept.length === o.items.length) continue;
        await this.orders.replaceItems(tx, o.id, kept.map(({ orderId: _o, position: _p, ...it }) => it));
        await this.orders.update(tx, o.id, {
          total: kept.reduce((s, it) => s + it.price * it.qty, 0),
          adultItemsRemovedAt: now,
          ...(kept.length ? {} : { status: 'CANCELLED' }),
          updatedAt: now,
        });
        publish.push(await this.notifications.notify('PREORDER_ADULT_REMOVED', [o.userId], { venueId: o.venueId, reservationId: o.reservationId, orderId: o.id }, tx));
        const staff = await this.notifications.venueStaffRecipients(o.venueId, tx);
        publish.push(await this.notifications.notify('PREORDER_UPDATED', staff, { venueId: o.venueId, reservationId: o.reservationId, orderId: o.id }, tx));
      }
      await tx.insert(adultPermissionLog).values({
        id: randomUUID(),
        userId: guestId,
        action: 'REVOKE',
        staffId: actor.user.id,
        staffRole: actor.role,
        staffDisplayName: staffDisplayName(actor.user),
        venueId,
        reason: reason.trim(),
        createdAt: now,
      });
      publish.push(await this.notifications.notify('ADULT_REVOKED', [guestId], { venueId }, tx));
      return u;
    });
    for (const p of publish) p();
    return adultStatus(updated);
  }

  /** The audit, newest first; one guest or everyone. */
  async log(userId?: string) {
    const rows = await this.db
      .select()
      .from(adultPermissionLog)
      .where(userId ? eq(adultPermissionLog.userId, userId) : undefined)
      .orderBy(desc(adultPermissionLog.createdAt));
    return rows.map(presentLog);
  }

  /** In-person ID check before serving the 18+ lines of a preorder; refusal removes them. */
  async ageCheck(staffUserId: string, orderId: string, idChecked: boolean, approved: boolean) {
    const o = await this.orders.byId(orderId);
    if (!o || !o.preorder) throw notFound('not_found');
    if (!(await this.access.staffActor(staffUserId, o.venueId))) throw forbidden();
    if (approved && !idChecked) throw badRequest('id_document_required');
    if (o.status === 'CANCELLED' || o.status === 'PAID') throw conflict('conflict');
    const now = this.clock.now();
    const kept = o.items.filter((it) => approved || it.ageCheck !== PENDING).map(({ orderId: _o, position: _p, ...it }) => ({ ...it, ageCheck: it.ageCheck === PENDING ? 'CONFIRMED' : it.ageCheck }));
    const refused = kept.length < o.items.length;
    let publish: () => void = () => {};
    await this.db.transaction(async (tx) => {
      await this.orders.replaceItems(tx, o.id, kept);
      await this.orders.update(tx, o.id, {
        total: kept.reduce((s, it) => s + it.price * it.qty, 0),
        ...(kept.length ? {} : { status: 'CANCELLED' }),
        updatedAt: now.toISOString(),
      });
      if (refused) publish = await this.notifications.notify('PREORDER_AGE_REFUSED', [o.userId], { venueId: o.venueId, reservationId: o.reservationId, orderId: o.id }, tx);
    });
    publish();
    return presentOrder((await this.orders.byId(o.id))!, now);
  }
}
