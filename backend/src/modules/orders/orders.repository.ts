import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { menuItems, orderItems, orders, venues } from '../../database/schema/index.js';

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
/** An order with its lines and what is needed to decorate it for reading. */
export type OrderRecord = OrderRow & {
  items: OrderItemRow[];
  venueName: { ru: string; en: string; ro: string } | null;
  /** Menu item ids of the lines that are deleted or on the stop list now. */
  unavailable: Set<string>;
};
export type Db = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

@Injectable()
export class OrdersRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Orders matching `where`, with lines, venue names and line availability. */
  async load(where: ReturnType<typeof and>, db: Db = this.db): Promise<OrderRecord[]> {
    const rows = await db
      .select({ order: orders, venueName: venues.name })
      .from(orders)
      .leftJoin(venues, eq(venues.id, orders.venueId))
      .where(where)
      .orderBy(asc(orders.createdAt));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.order.id);
    const lines = await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.orderId), asc(orderItems.position));
    const menuIds = [...new Set(lines.map((l) => l.menuItemId))];
    const live = menuIds.length
      ? await db.select({ id: menuItems.id }).from(menuItems).where(and(inArray(menuItems.id, menuIds), eq(menuItems.stopped, false)))
      : [];
    const available = new Set(live.map((m) => m.id));
    return rows.map(({ order, venueName }) => {
      const items = lines.filter((l) => l.orderId === order.id);
      return { ...order, items, venueName, unavailable: new Set(items.map((i) => i.menuItemId).filter((id) => !available.has(id))) };
    });
  }

  async byId(id: string, db: Db = this.db): Promise<OrderRecord | undefined> {
    return (await this.load(eq(orders.id, id), db))[0];
  }

  /** The reservation's preorder that is not cancelled. */
  async activePreorder(reservationId: string, db: Db = this.db): Promise<OrderRecord | undefined> {
    return (await this.load(and(eq(orders.preorder, true), eq(orders.reservationId, reservationId), ne(orders.status, 'CANCELLED')), db))[0];
  }

  async activePreorders(reservationIds: string[], db: Db = this.db): Promise<OrderRecord[]> {
    if (!reservationIds.length) return [];
    return this.load(and(eq(orders.preorder, true), inArray(orders.reservationId, reservationIds), ne(orders.status, 'CANCELLED')), db);
  }

  async count(db: Db = this.db): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
    return row?.n ?? 0;
  }

  async insert(db: Db, order: typeof orders.$inferInsert, items: Array<Omit<typeof orderItems.$inferInsert, 'orderId' | 'position'>>): Promise<void> {
    await db.insert(orders).values(order);
    await this.insertItems(db, order.id, items);
  }

  async update(db: Db, id: string, patch: Partial<typeof orders.$inferInsert>): Promise<void> {
    await db.update(orders).set(patch).where(eq(orders.id, id));
  }

  async replaceItems(db: Db, orderId: string, items: Array<Omit<typeof orderItems.$inferInsert, 'orderId' | 'position'>>): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await this.insertItems(db, orderId, items);
  }

  private async insertItems(db: Db, orderId: string, items: Array<Omit<typeof orderItems.$inferInsert, 'orderId' | 'position'>>) {
    if (items.length) await db.insert(orderItems).values(items.map((it, position) => ({ ...it, orderId, position })));
  }
}
