import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { orders, reservations, sessions, tables, waiterCalls } from '../../database/schema/index.js';

export type SessionRow = typeof sessions.$inferSelect;
export type WaiterCallRow = typeof waiterCalls.$inferSelect;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Db = Database | Tx;

/** Table sessions (QR), waiter calls and the live table state they change. */
@Injectable()
export class FloorRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async session(id: string, db: Db = this.db): Promise<SessionRow | undefined> {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    return row;
  }

  async lockSession(tx: Tx, id: string): Promise<SessionRow | undefined> {
    const [row] = await tx.select().from(sessions).where(eq(sessions.id, id)).for('update');
    return row;
  }

  async insertSession(tx: Tx, row: typeof sessions.$inferInsert): Promise<void> {
    await tx.insert(sessions).values(row);
  }

  async updateSession(tx: Tx, id: string, patch: Partial<typeof sessions.$inferInsert>): Promise<SessionRow> {
    const [row] = await tx.update(sessions).set(patch).where(eq(sessions.id, id)).returning();
    return row;
  }

  async lockTable(tx: Tx, id: string) {
    const [row] = await tx.select().from(tables).where(eq(tables.id, id)).for('update');
    return row;
  }

  async setTable(tx: Tx, id: string, patch: Partial<typeof tables.$inferInsert>): Promise<void> {
    await tx.update(tables).set(patch).where(eq(tables.id, id));
  }

  async lockReservation(tx: Tx, id: string) {
    const [row] = await tx.select().from(reservations).where(eq(reservations.id, id)).for('update');
    return row;
  }

  async checkIn(tx: Tx, id: string, at: string): Promise<void> {
    await tx.update(reservations).set({ status: 'CHECKED_IN', updatedAt: at }).where(eq(reservations.id, id));
  }

  /** The booking's preorder now belongs to the table session opened at check-in. */
  async linkPreorder(tx: Tx, reservationId: string, sessionId: string): Promise<void> {
    await tx
      .update(orders)
      .set({ sessionId })
      .where(and(eq(orders.preorder, true), eq(orders.reservationId, reservationId), eq(orders.sessionId, '')));
  }

  async insertCall(row: typeof waiterCalls.$inferInsert): Promise<WaiterCallRow> {
    const [created] = await this.db.insert(waiterCalls).values(row).returning();
    return created;
  }

  async call(id: string): Promise<WaiterCallRow | undefined> {
    const [row] = await this.db.select().from(waiterCalls).where(eq(waiterCalls.id, id));
    return row;
  }

  async setCallStatus(id: string, status: string): Promise<WaiterCallRow> {
    const [row] = await this.db.update(waiterCalls).set({ status }).where(eq(waiterCalls.id, id)).returning();
    return row;
  }

  callsOf(venueId: string): Promise<WaiterCallRow[]> {
    return this.db.select().from(waiterCalls).where(eq(waiterCalls.venueId, venueId)).orderBy(desc(waiterCalls.createdAt));
  }
}
