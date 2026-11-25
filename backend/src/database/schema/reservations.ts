import { boolean, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { ts } from './columns.js';
import { users } from './users.js';
import { venues, venueTables } from './venues.js';

/** Postgres tstzrange as "[start,end)". Written by the service, read only by the constraint. */
const tstzrange = customType<{ data: string }>({ dataType: () => 'tstzrange' });

export const reservations = pgTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    venueId: text('venue_id').notNull().references(() => venues.id),
    /** Primary table; all tables of the booking are in reservation_tables. */
    tableId: text('table_id').notNull(),
    guests: integer('guests').notNull(),
    reservedFor: ts('reserved_for').notNull(),
    durationMin: integer('duration_min').notNull().default(0),
    status: text('status').notNull(),
    source: text('source').notNull().default('WEB'),
    notes: text('notes').notNull().default(''),
    arrivalConfirmedAt: ts('arrival_confirmed_at'),
    expectedArrival: ts('expected_arrival'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('reservations_user_idx').on(t.userId), index('reservations_venue_time_idx').on(t.venueId, t.reservedFor)],
);

/**
 * Tables held by a booking. `blocks` is the booking window [reserved_for, +duration);
 * an exclusion constraint (migration 0001) forbids two active windows on one table.
 */
export const reservationTables = pgTable(
  'reservation_tables',
  {
    reservationId: text('reservation_id').notNull().references(() => reservations.id, { onDelete: 'cascade' }),
    tableId: text('table_id').notNull().references(() => venueTables.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    blocks: tstzrange('blocks').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.reservationId, t.tableId] })],
);

/** "Notify me when this table frees up" (2 hours). */
export const tableWatches = pgTable('table_watches', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  tableId: text('table_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
});
