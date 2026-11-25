import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { tables, venues } from './catalog.js';
import { localized, ts, tstzrange } from './columns.js';
import { users } from './users.js';

export const reservations = pgTable(
  'reservations',
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id),
    venueId: text().notNull().references(() => venues.id, { onDelete: 'cascade' }),
    /** Primary table; all tables are in reservation_tables. */
    tableId: text().notNull(),
    guests: integer().notNull(),
    reservedFor: ts('reserved_for').notNull(),
    durationMin: integer().notNull().default(0),
    /** CONFIRMED | CHECKED_IN | CANCELLED | NO_SHOW */
    status: text().notNull(),
    source: text().notNull().default('WEB'),
    notes: text().notNull().default(''),
    arrivalConfirmedAt: ts('arrival_confirmed_at'),
    expectedArrival: ts('expected_arrival'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.venueId, t.reservedFor)],
);

/**
 * Tables a reservation holds and the time it blocks them ([reserved_for, arrival + duration)).
 * An EXCLUDE constraint (migration 0001) forbids two active reservations overlapping on a table.
 */
export const reservationTables = pgTable(
  'reservation_tables',
  {
    reservationId: text().notNull().references(() => reservations.id, { onDelete: 'cascade' }),
    tableId: text().notNull().references(() => tables.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
    blocks: tstzrange('blocks').notNull(),
    /** CONFIRMED or CHECKED_IN; cancelled / no-show rows stop blocking. */
    active: boolean().notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.reservationId, t.tableId] }), index().on(t.tableId)],
);

export const tableWatches = pgTable('table_watches', {
  id: text().primaryKey(),
  userId: text().notNull(),
  venueId: text().notNull(),
  tableId: text().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
});

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text().primaryKey(),
    venueId: text().notNull().references(() => venues.id, { onDelete: 'cascade' }),
    userId: text().notNull().default(''),
    guestName: text().notNull().default(''),
    phone: text().notNull().default(''),
    guests: integer().notNull(),
    zone: text().notNull().default('hall'),
    note: text().notNull().default(''),
    /** WAITING | READY | SEATED | LEFT | EXPIRED */
    status: text().notNull(),
    source: text().notNull().default('APP'),
    tableId: text().notNull().default(''),
    quotedWait: integer().notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    notifiedAt: ts('notified_at'),
    seatedAt: ts('seated_at'),
    closedAt: ts('closed_at'),
  },
  (t) => [index().on(t.venueId, t.status)],
);

export const eventInquiries = pgTable(
  'event_inquiries',
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    venueId: text().notNull(),
    eventType: text().notNull(),
    guestCount: integer().notNull(),
    preferredDate: ts('preferred_date').notNull(),
    contactMethod: text().notNull(),
    contactPhone: text().notNull().default(''),
    contactName: text().notNull().default(''),
    notes: text().notNull().default(''),
    /** PENDING | CONTACTED | CONFIRMED */
    status: text().notNull().default('PENDING'),
    adminPhone: text().notNull().default(''),
    adminTelegram: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.venueId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    venueId: text().notNull(),
    tableId: text().notNull(),
    reservationId: text(),
    /** ACTIVE | CLOSED */
    status: text().notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    closedAt: ts('closed_at'),
  },
  (t) => [index().on(t.userId), index().on(t.venueId, t.status)],
);

export const orders = pgTable(
  'orders',
  {
    id: text().primaryKey(),
    sessionId: text().notNull().default(''),
    userId: text().notNull(),
    venueId: text().notNull(),
    preorder: boolean().notNull().default(false),
    reservationId: text().notNull().default(''),
    kitchenAt: ts('kitchen_at'),
    adultItemsRemovedAt: ts('adult_items_removed_at'),
    /** DRAFT | SUBMITTED | PREPARING | READY | SERVED | PAID | CANCELLED */
    status: text().notNull(),
    total: integer().notNull().default(0),
    checkNumber: text().notNull().default(''),
    paymentMethod: text().notNull().default(''),
    paidAt: ts('paid_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.venueId), index().on(t.reservationId).where(sql`${t.preorder}`)],
);

export const orderItems = pgTable(
  'order_items',
  {
    orderId: text().notNull().references(() => orders.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    menuItemId: text().notNull(),
    name: localized('name').notNull(),
    qty: integer().notNull(),
    /** Per unit at the moment of ordering. */
    price: integer().notNull(),
    requiresAge18: boolean('requires_age_18').notNull().default(false),
    containsAlcohol: boolean().notNull().default(false),
    /** '' | PENDING_AGE_CHECK | CONFIRMED */
    ageCheck: text().notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.position] })],
);

export const waiterCalls = pgTable(
  'waiter_calls',
  {
    id: text().primaryKey(),
    sessionId: text().notNull(),
    venueId: text().notNull(),
    tableId: text().notNull(),
    reason: text().notNull(),
    /** PENDING | ACCEPTED | DONE */
    status: text().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.venueId, t.status)],
);

