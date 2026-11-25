import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { Env } from '../../config/env.schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { legacyQr, verifyQr } from '../../core/qr/qr-token.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { orders } from '../../database/schema/index.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { checkNumber, presentOrder } from '../orders/order.presenter.js';
import { type OrderRecord, OrdersRepository } from '../orders/orders.repository.js';
import { FloorRepository, type SessionRow, type WaiterCallRow } from './floor.repository.js';

const REASONS = ['order', 'bill', 'question', 'other', 'initial'];
export const ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'PREPARING', 'READY', 'SERVED', 'PAID', 'CANCELLED'];

export function presentSession(s: SessionRow) {
  return {
    id: s.id,
    user_id: s.userId,
    venue_id: s.venueId,
    table_id: s.tableId,
    ...(s.reservationId ? { reservation_id: s.reservationId } : {}),
    status: s.status,
    started_at: formatDbTime(s.startedAt),
    ...(s.closedAt ? { closed_at: formatDbTime(s.closedAt) } : {}),
  };
}

export function presentCall(c: WaiterCallRow) {
  return { id: c.id, session_id: c.sessionId, venue_id: c.venueId, table_id: c.tableId, reason: c.reason, status: c.status, created_at: formatDbTime(c.createdAt) };
}

/** 18+ lines of a preorder wait for the in-person ID check before being served or paid. */
export const hasPendingAgeCheck = (o: OrderRecord) => o.items.some((i) => i.ageCheck === 'PENDING_AGE_CHECK');

/** At the table: QR sessions, orders, waiter calls and payment. */
@Injectable()
export class FloorService {
  private readonly qrSecret: string;

  constructor(
    private readonly repo: FloorRepository,
    private readonly orders: OrdersRepository,
    private readonly catalog: CatalogService,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.qrSecret = config.get('QR_SECRET', { infer: true });
  }

  /**
   * Scanning the table QR opens a session: a free table is a walk-in, a reserved one
   * must be the guest's own booking (it is checked in). The table becomes occupied.
   */
  async scanQr(userId: string, venueId: string, tableId: string, token: string) {
    const code = token.trim();
    if (!code) throw badRequest('invalid_qr_token');
    if (!(await this.catalog.publishedVenue(venueId))) throw notFound('not_found');
    const id = randomUUID();
    await this.repo.transaction(async (tx) => {
      const t = await this.repo.lockTable(tx, tableId);
      if (!t || t.venueId !== venueId) throw notFound('not_found');
      // Without a stored token any non-empty one is accepted (as Go, for old tables).
      if (t.qrToken && code !== t.qrToken && code !== legacyQr(venueId, tableId) && !verifyQr(this.qrSecret, venueId, tableId, code)) {
        throw badRequest('invalid_qr_token');
      }
      const now = this.clock.now().toISOString();
      let reservationId: string | null = null;
      if (t.status === 'RESERVED') {
        if (!t.reservationId) throw conflict('table_unavailable');
        const r = await this.repo.lockReservation(tx, t.reservationId);
        if (!r || r.userId !== userId) throw forbidden();
        if (r.status !== 'CONFIRMED' && r.status !== 'CHECKED_IN') throw conflict('table_unavailable');
        await this.repo.checkIn(tx, r.id, now);
        reservationId = r.id;
      } else if (t.status !== 'FREE') {
        throw conflict('table_unavailable');
      }
      await this.repo.insertSession(tx, { id, userId, venueId, tableId, reservationId, status: 'ACTIVE', startedAt: now });
      if (reservationId) await this.repo.linkPreorder(tx, reservationId, id);
      await this.repo.setTable(tx, tableId, { status: 'OCCUPIED', occupiedSince: now, reservedFor: null });
    });
    return presentSession((await this.repo.session(id))!);
  }

  async session(userId: string, id: string) {
    const s = await this.repo.session(id);
    if (!s) throw notFound('session_not_found');
    if (s.userId !== userId) throw forbidden();
    return presentSession(s);
  }

  /** The guest leaves: the session closes and the table is free again. */
  async closeSession(userId: string, id: string) {
    const s = await this.repo.transaction(async (tx) => {
      const s = await this.repo.lockSession(tx, id);
      if (!s) throw notFound('session_not_found');
      if (s.userId !== userId) throw forbidden();
      if (s.status !== 'ACTIVE') throw conflict('session_closed');
      const closed = await this.repo.updateSession(tx, id, { status: 'CLOSED', closedAt: this.clock.now().toISOString() });
      await this.repo.setTable(tx, s.tableId, { status: 'FREE', occupiedSince: null, reservationId: null });
      return closed;
    });
    return presentSession(s);
  }

  async createOrder(userId: string, sessionId: string, items: Array<{ menu_item_id: string; qty: number }>) {
    const now = this.clock.now();
    const id = randomUUID();
    await this.repo.transaction(async (tx) => {
      const s = await this.repo.lockSession(tx, sessionId);
      if (!s) throw notFound('not_found');
      if (s.userId !== userId) throw forbidden();
      if (s.status !== 'ACTIVE') throw conflict('session_closed');
      if (!items.length) throw badRequest('invalid_items');
      const menu = new Map((await this.catalog.menuItemsByIds(items.map((i) => i.menu_item_id))).map((m) => [m.id, m]));
      let total = 0;
      const lines = items.map((it) => {
        if (it.qty < 1) throw badRequest('invalid_items');
        const mi = menu.get(it.menu_item_id);
        if (!mi || mi.venueId !== s.venueId) throw notFound('not_found');
        if (mi.stopped) throw badRequest('invalid_items');
        total += mi.price * it.qty;
        return { menuItemId: mi.id, name: mi.name, qty: it.qty, price: mi.price };
      });
      await this.orders.insert(
        tx,
        {
          id,
          sessionId,
          userId,
          venueId: s.venueId,
          status: 'SUBMITTED',
          total,
          checkNumber: checkNumber(now, await this.orders.count(tx)),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        lines,
      );
    });
    return presentOrder((await this.orders.byId(id))!, now);
  }

  async myOrders(userId: string) {
    const now = this.clock.now();
    return (await this.orders.load(eq(orders.userId, userId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => presentOrder(o, now));
  }

  async order(userId: string, id: string) {
    const o = await this.orders.byId(id);
    if (!o) throw notFound('order_not_found');
    if (o.userId !== userId) throw forbidden();
    return presentOrder(o, this.clock.now());
  }

  /** In the app: paid now. At the venue: the waiter takes it (a table order is served). */
  async pay(userId: string, orderId: string, rawMethod: string) {
    const now = this.clock.now();
    const o = await this.orders.byId(orderId);
    if (!o) throw notFound('order_not_found');
    if (o.userId !== userId) throw forbidden();
    if (o.status === 'CANCELLED') throw conflict('conflict');
    if (o.status !== 'PAID') {
      if (hasPendingAgeCheck(o)) throw conflict('age_check_pending');
      const method = rawMethod.trim().toLowerCase();
      const patch: Partial<typeof orders.$inferInsert> = { updatedAt: now.toISOString() };
      if (['app', 'card', 'online'].includes(method)) Object.assign(patch, { status: 'PAID', paymentMethod: 'app', paidAt: now.toISOString() });
      else if (['venue', 'cash', 'at_venue'].includes(method)) {
        patch.paymentMethod = 'venue';
        if (!o.preorder && ['SUBMITTED', 'PREPARING', 'READY'].includes(o.status)) patch.status = 'SERVED';
      } else throw badRequest('bad_request');
      await this.repo.transaction(async (tx) => {
        if (!o.checkNumber) patch.checkNumber = checkNumber(now, (await this.orders.count(tx)) - 1);
        await this.orders.update(tx, orderId, patch);
      });
    }
    const paid = presentOrder((await this.orders.byId(orderId))!, now);
    return { status: paid.status === 'PAID' ? 'paid' : 'pending', order: paid };
  }

  async callWaiter(userId: string, sessionId: string, reason: string) {
    const s = await this.repo.session(sessionId);
    if (!s) throw notFound('session_not_found');
    if (s.userId !== userId) throw forbidden();
    if (s.status !== 'ACTIVE') throw conflict('session_closed');
    if (!REASONS.includes(reason)) throw badRequest('invalid_reason');
    const call = await this.repo.insertCall({
      id: randomUUID(),
      sessionId,
      venueId: s.venueId,
      tableId: s.tableId,
      reason,
      status: 'PENDING',
      createdAt: this.clock.now().toISOString(),
    });
    return presentCall(call);
  }

  // Staff side (callers check venue access first).

  async calls(venueId: string) {
    if (!(await this.catalog.publishedVenue(venueId))) throw notFound('venue_not_found');
    return (await this.repo.callsOf(venueId)).map(presentCall);
  }

  async call(id: string): Promise<WaiterCallRow> {
    const c = await this.repo.call(id);
    if (!c) throw notFound('not_found');
    return c;
  }

  async acceptCall(id: string) {
    const c = await this.call(id);
    if (c.status !== 'PENDING') throw conflict('already_accepted');
    return presentCall(await this.repo.setCallStatus(id, 'ACCEPTED'));
  }

  async completeCall(id: string) {
    const c = await this.call(id);
    if (c.status === 'DONE') throw conflict('conflict');
    return presentCall(await this.repo.setCallStatus(id, 'DONE'));
  }

  async venueOrders(venueId: string) {
    if (!(await this.catalog.publishedVenue(venueId))) throw notFound('not_found');
    const now = this.clock.now();
    return (await this.orders.load(eq(orders.venueId, venueId))).map((o) => presentOrder(o, now));
  }

  async orderRecord(id: string): Promise<OrderRecord> {
    const o = await this.orders.byId(id);
    if (!o) throw notFound('not_found');
    return o;
  }

  /** Kitchen / floor status change; 18+ preorder lines must be checked before serving or payment. */
  async setOrderStatus(id: string, status: string) {
    const o = await this.orderRecord(id);
    if (!ORDER_STATUSES.includes(status)) throw badRequest('bad_request');
    if ((status === 'SERVED' || status === 'PAID') && hasPendingAgeCheck(o)) throw conflict('age_check_pending');
    const now = this.clock.now();
    await this.repo.transaction(async (tx) => {
      const patch: Partial<typeof orders.$inferInsert> = { status, updatedAt: now.toISOString() };
      if (status === 'PAID' && !o.paidAt) {
        patch.paidAt = now.toISOString();
        if (!o.paymentMethod) patch.paymentMethod = 'venue';
        if (!o.checkNumber) patch.checkNumber = checkNumber(now, (await this.orders.count(tx)) - 1);
      }
      await this.orders.update(tx, id, patch);
    });
    return presentOrder((await this.orders.byId(id))!, now);
  }
}
