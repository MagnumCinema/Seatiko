import { boolean, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { localized, ts } from './columns.js';
import { users } from './users.js';
import { venues } from './venues.js';

/** A guest at a table after scanning its QR (walk-in or checked-in booking). */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    venueId: text('venue_id').notNull().references(() => venues.id),
    tableId: text('table_id').notNull(),
    reservationId: text('reservation_id'),
    status: text('status').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    closedAt: ts('closed_at'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Orders at the table and preorders for a booking (preorder = true). */
export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().default(''),
    preorder: boolean('preorder').notNull().default(false),
    reservationId: text('reservation_id'),
    kitchenAt: ts('kitchen_at'),
    adultItemsRemovedAt: ts('adult_items_removed_at'),
    userId: text('user_id').notNull().references(() => users.id),
    venueId: text('venue_id').notNull().references(() => venues.id),
    status: text('status').notNull(),
    total: integer('total').notNull().default(0),
    checkNumber: text('check_number').notNull().default(''),
    paymentMethod: text('payment_method').notNull().default(''),
    paidAt: ts('paid_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('orders_venue_idx').on(t.venueId), index('orders_user_idx').on(t.userId), index('orders_reservation_idx').on(t.reservationId)],
);

/** Order lines with the price at the time of ordering. */
export const orderItems = pgTable(
  'order_items',
  {
    orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    menuItemId: text('menu_item_id').notNull(),
    name: localized('name').notNull(),
    qty: integer('qty').notNull(),
    price: integer('price').notNull(),
    requiresAge18: boolean('requires_age_18').notNull().default(false),
    containsAlcohol: boolean('contains_alcohol').notNull().default(false),
    /** PENDING_AGE_CHECK / CONFIRMED for 18+ lines of a preorder. */
    ageCheck: text('age_check').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.position] })],
);

export const waiterCalls = pgTable(
  'waiter_calls',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    venueId: text('venue_id').notNull().references(() => venues.id),
    tableId: text('table_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('waiter_calls_venue_idx').on(t.venueId)],
);
