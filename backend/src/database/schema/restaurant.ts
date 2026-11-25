import { boolean, doublePrecision, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { localized, ts, type LocalizedString } from './columns.js';
import { users } from './users.js';
import { venues } from './venues.js';

/** Restaurant onboarding application (owner's venue profile under moderation). */
export const applications = pgTable(
  'venue_applications',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull().references(() => users.id),
    status: text('status').notNull(),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    address: localized('address').notNull(),
    cuisine: text('cuisine').array().notNull().default([]),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    website: text('website').notNull().default(''),
    cityId: text('city_id').notNull().default(''),
    lat: doublePrecision('lat').notNull().default(0),
    lng: doublePrecision('lng').notNull().default(0),
    priceLevel: integer('price_level').notNull().default(0),
    averageCheck: integer('average_check').notNull().default(0),
    photoUrls: text('photo_urls').array().notNull().default([]),
    hoursText: text('hours_text').notNull().default(''),
    rejectReason: text('reject_reason').notNull().default(''),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    bookingIntervalMin: integer('booking_interval_min').notNull().default(0),
    holdMinutes: integer('hold_minutes').notNull().default(0),
    allowPreorder: boolean('allow_preorder').notNull().default(false),
    sessionStartBeforeMin: integer('session_start_before_min').notNull().default(0),
    releaseBeforeMin: integer('release_before_min').notNull().default(0),
    maxLateArrivalMin: integer('max_late_arrival_min').notNull().default(0),
    visitDurationMin: integer('visit_duration_min').notNull().default(0),
    maxVisitDurationMin: integer('max_visit_duration_min').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [index('venue_applications_owner_idx').on(t.ownerUserId), index('venue_applications_status_idx').on(t.status)],
);

/** Append-only journal of an application (moderation, edits). */
export const applicationActivities = pgTable(
  'application_activities',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    changedFields: text('changed_fields').array().notNull().default([]),
    note: text('note').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('application_activities_app_idx').on(t.applicationId)],
);

export type ApplicationPatch = Partial<{
  name: LocalizedString;
  description: LocalizedString;
  address: LocalizedString;
  cuisine: string[];
  phone: string;
  email: string;
  website: string;
  city_id: string;
  lat: number;
  lng: number;
  price_level: number;
  average_check: number;
  hours_text: string;
}>;

/** Changes to a published venue profile, approved by an admin. */
export const profileChangeRequests = pgTable('profile_change_requests', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  ownerUserId: text('owner_user_id').notNull(),
  status: text('status').notNull(),
  patch: jsonb('patch').$type<ApplicationPatch>().notNull(),
  note: text('note').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** Venue team: invited or active waiters and cooks. */
export const staffMembers = pgTable(
  'staff_members',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().default(''),
    name: text('name').notNull().default(''),
    email: text('email').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull(),
    onShift: boolean('on_shift').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('staff_members_venue_idx').on(t.venueId), index('staff_members_user_idx').on(t.userId)],
);

/** Scheduled work shifts (date and local HH:MM times of the venue). */
export const workShifts = pgTable(
  'work_shifts',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    staffId: text('staff_id').notNull().references(() => staffMembers.id, { onDelete: 'cascade' }),
    staffName: text('staff_name').notNull().default(''),
    role: text('role').notNull(),
    date: text('date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    status: text('status').notNull(),
    note: text('note').notNull().default(''),
    reason: text('reason').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('work_shifts_venue_date_idx').on(t.venueId, t.date), index('work_shifts_staff_idx').on(t.staffId)],
);
