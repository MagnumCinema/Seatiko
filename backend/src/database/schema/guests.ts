import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { ts } from './columns.js';
import { users } from './users.js';
import { venues } from './venues.js';

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().default(''),
    guestName: text('guest_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    guests: integer('guests').notNull(),
    zone: text('zone').notNull().default(''),
    note: text('note').notNull().default(''),
    status: text('status').notNull(),
    source: text('source').notNull(),
    tableId: text('table_id').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    notifiedAt: ts('notified_at'),
    seatedAt: ts('seated_at'),
    closedAt: ts('closed_at'),
  },
  (t) => [index('waitlist_venue_status_idx').on(t.venueId, t.status)],
);

/** Banquet / event requests (not persisted by the Go API — fixed here). */
export const eventInquiries = pgTable(
  'event_inquiries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    venueId: text('venue_id').notNull().references(() => venues.id),
    eventType: text('event_type').notNull(),
    guestCount: integer('guest_count').notNull(),
    preferredDate: ts('preferred_date').notNull(),
    contactMethod: text('contact_method').notNull(),
    contactPhone: text('contact_phone').notNull().default(''),
    contactName: text('contact_name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull(),
    adminPhone: text('admin_phone').notNull().default(''),
    adminTelegram: text('admin_telegram').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('event_inquiries_user_idx').on(t.userId)],
);

/** Append-only audit of 18+ grants and revokes. */
export const adultPermissionLog = pgTable(
  'adult_permission_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    action: text('action').notNull(),
    staffId: text('staff_id').notNull(),
    staffRole: text('staff_role').notNull(),
    staffDisplayName: text('staff_display_name').notNull(),
    venueId: text('venue_id').notNull(),
    reservationId: text('reservation_id').notNull().default(''),
    idDocumentChecked: boolean('id_document_checked').notNull().default(false),
    idDocumentType: text('id_document_type').notNull().default(''),
    reason: text('reason').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('adult_permission_log_user_idx').on(t.userId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    venueId: text('venue_id').notNull().default(''),
    reservationId: text('reservation_id').notNull().default(''),
    orderId: text('order_id').notNull().default(''),
    at: ts('at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    readAt: ts('read_at'),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

/** Key–value markers (e.g. demo menu version applied). */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
