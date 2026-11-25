import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { Clock, dbDate } from '../../core/time/time.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { VenueRecord } from '../catalog/catalog.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { checkNumber, presentOrder } from '../orders/order.presenter.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import { AGE_CHECK_PENDING, mergePreorderLines, preorderKitchenAt, requiresAge18 } from './domain/rules.js';
import { type ReservationRow, ReservationsRepository, type Tx } from './reservations.repository.js';

/**
 * Preorder: dishes a guest orders ahead for their booking (APP_LOGIC §5.3, §7). An Order
 * with preorder=true; prices fixed when saved; editable until the kitchen time.
 */
@Injectable()
export class PreordersService {
  constructor(
    private readonly reservations: ReservationsRepository,
    private readonly orders: OrdersRepository,
    private readonly catalog: CatalogService,
    private readonly accounts: AccountsService,
    private readonly access: VenueAccessService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** The guest may still create, change or cancel it: own, confirmed, before the kitchen time. */
  private async editable(tx: Tx, userId: string, id: string, now: Date): Promise<{ r: ReservationRow; venue: VenueRecord }> {
    const r = await this.reservations.lock(tx, id);
    if (!r) throw notFound('not_found');
    if (r.userId !== userId) throw forbidden();
    const venue = await this.catalog.publishedVenue(r.venueId);
    if (!venue || r.status !== 'CONFIRMED' || now >= preorderKitchenAt(dbDate(r.reservedFor), venue)) throw conflict('preorder_closed');
    return { r, venue };
  }

  /** The booking's preorder, for its guest, the venue's staff, owner or an admin. */
  async get(userId: string, id: string) {
    const r = await this.reservations.byId(id);
    if (!r) throw notFound('not_found');
    if (r.userId !== userId && !(await this.access.staffActor(userId, r.venueId))) throw forbidden();
    const o = await this.orders.activePreorder(id);
    if (!o) throw notFound('not_found');
    return presentOrder(o, this.clock.now());
  }

  async save(userId: string, id: string, items: Array<{ menu_item_id: string; qty: number }>) {
    const now = this.clock.now();
    const user = await this.accounts.user(userId);
    let publish: () => void = () => {};
    const orderId = await this.reservations.transaction(async (tx) => {
      const { r, venue } = await this.editable(tx, userId, id, now);
      if (!venue.allowPreorder) throw conflict('preorder_disabled');
      const lines = mergePreorderLines(items);
      if (!lines) throw badRequest('invalid_items');
      const menu = new Map((await this.catalog.menuItemsByIds(lines.map((l) => l.id))).map((m) => [m.id, m]));
      let total = 0;
      const rows = lines.map(({ id: itemId, qty }) => {
        const mi = menu.get(itemId);
        if (!mi || mi.venueId !== r.venueId) throw notFound('not_found');
        if (mi.stopped) throw conflict('item_unavailable');
        const adult = requiresAge18(mi);
        if (adult && !user.adultPreorderAllowed) throw forbidden('age_verification_required');
        if (mi.containsAlcohol && !venue.alcoholLicense) throw conflict('item_unavailable');
        total += mi.price * qty;
        return {
          menuItemId: mi.id,
          name: mi.name,
          qty,
          price: mi.price,
          requiresAge18: adult,
          containsAlcohol: mi.containsAlcohol,
          ageCheck: adult ? AGE_CHECK_PENDING : '',
        };
      });

      const kitchenAt = preorderKitchenAt(dbDate(r.reservedFor), venue).toISOString();
      const existing = await this.orders.activePreorder(id, tx);
      const at = now.toISOString();
      let oid: string;
      if (existing) {
        oid = existing.id;
        await this.orders.update(tx, oid, { total, kitchenAt, adultItemsRemovedAt: null, updatedAt: at });
        await this.orders.replaceItems(tx, oid, rows);
      } else {
        oid = randomUUID();
        await this.orders.insert(
          tx,
          {
            id: oid,
            userId,
            venueId: r.venueId,
            preorder: true,
            reservationId: r.id,
            status: 'SUBMITTED',
            total,
            kitchenAt,
            checkNumber: checkNumber(now, await this.orders.count(tx)),
            createdAt: at,
            updatedAt: at,
          },
          rows,
        );
      }
      const staff = await this.notifications.venueStaffRecipients(r.venueId, tx);
      publish = await this.notifications.notify(existing ? 'PREORDER_UPDATED' : 'PREORDER_CREATED', staff, { venueId: r.venueId, reservationId: r.id, orderId: oid, at: r.reservedFor }, tx);
      return oid;
    });
    publish();
    return presentOrder((await this.orders.byId(orderId))!, now);
  }

  async cancel(userId: string, id: string) {
    const now = this.clock.now();
    let publish: () => void = () => {};
    const orderId = await this.reservations.transaction(async (tx) => {
      const { r } = await this.editable(tx, userId, id, now);
      const o = await this.orders.activePreorder(id, tx);
      if (!o) throw notFound('not_found');
      await this.orders.update(tx, o.id, { status: 'CANCELLED', updatedAt: now.toISOString() });
      const staff = await this.notifications.venueStaffRecipients(o.venueId, tx);
      publish = await this.notifications.notify('PREORDER_CANCELLED', staff, { venueId: o.venueId, reservationId: id, orderId: o.id, at: r.reservedFor }, tx);
      return o.id;
    });
    publish();
    return presentOrder((await this.orders.byId(orderId))!, now);
  }

  /** The venue menu as this guest sees it for preordering: 18+ dishes blocked until staff verify the guest. */
  async menu(userId: string, venueId: string) {
    const items = await this.catalog.listMenu(venueId).catch(() => {
      throw notFound('venue_not_found');
    });
    const user = await this.accounts.user(userId);
    return items.map((item) => {
      if (item.stopped) return { ...item, orderable: false, blocked_reason: 'stopped' };
      if ((item.requires_age_18 || item.contains_alcohol) && !user.adultPreorderAllowed) return { ...item, orderable: false, blocked_reason: 'age_verification_required' };
      return { ...item, orderable: true };
    });
  }
}
