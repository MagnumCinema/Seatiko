import { boolean, doublePrecision, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { localized, textList, ts, type LocalizedString } from './columns.js';
import { users } from './users.js';

/** Restaurant onboarding application: the owner's venue profile under moderation. */
export const applications = pgTable(
  'applications',
  {
    id: text().primaryKey(),
    ownerUserId: text().notNull().references(() => users.id),
    /** DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | PUBLISHED */
    status: text().notNull(),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    address: localized('address').notNull(),
    cuisine: textList('cuisine'),
    phone: text().notNull().default(''),
    email: text().notNull().default(''),
    website: text().notNull().default(''),
    cityId: text().notNull().default(''),
    lat: doublePrecision().notNull().default(0),
    lng: doublePrecision().notNull().default(0),
    priceLevel: integer().notNull().default(0),
    averageCheck: integer().notNull().default(0),
    photoUrls: textList('photo_urls'),
    hoursText: text().notNull().default(''),
    rejectReason: text().notNull().default(''),
    /** Set when published. */
    venueId: text(),
    // Booking rules chosen during onboarding, copied to the venue on publish.
    bookingIntervalMin: integer().notNull().default(0),
    holdMinutes: integer().notNull().default(0),
    allowPreorder: boolean().notNull().default(false),
    sessionStartBeforeMin: integer().notNull().default(0),
    releaseBeforeMin: integer().notNull().default(0),
    maxLateArrivalMin: integer().notNull().default(0),
    visitDurationMin: integer().notNull().default(0),
    maxVisitDurationMin: integer().notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [index().on(t.ownerUserId), index().on(t.status)],
);

/** Append-only journal of an application (moderation, edits, publication). */
export const applicationActivities = pgTable(
  'application_activities',
  {
    id: text().primaryKey(),
    applicationId: text().notNull().references(() => applications.id, { onDelete: 'cascade' }),
    actorUserId: text().notNull().default(''),
    actorRole: text().notNull().default('system'),
    action: text().notNull(),
    changedFields: textList('changed_fields'),
    note: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.applicationId, t.createdAt)],
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

/** Changes to a published venue profile, applied after admin approval. */
export const profileChangeRequests = pgTable(
  'profile_change_requests',
  {
    id: text().primaryKey(),
    applicationId: text().notNull().references(() => applications.id, { onDelete: 'cascade' }),
    ownerUserId: text().notNull(),
    /** PENDING | APPROVED | REJECTED */
    status: text().notNull(),
    patch: jsonb().$type<ApplicationPatch>().notNull(),
    note: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.status)],
);

/** Venue team: invited or active waiters and cooks. */
export const staffMembers = pgTable(
  'staff_members',
  {
    id: text().primaryKey(),
    venueId: text().notNull(),
    userId: text().notNull().default(''),
    name: text().notNull().default(''),
    email: text().notNull(),
    /** waiter | cook */
    role: text().notNull().default('waiter'),
    /** INVITED | ACTIVE | REVOKED */
    status: text().notNull(),
    onShift: boolean().notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.venueId), index().on(t.userId)],
);

/** Scheduled work shifts: venue-local date (YYYY-MM-DD) and HH:MM times. */
export const workShifts = pgTable(
  'work_shifts',
  {
    id: text().primaryKey(),
    venueId: text().notNull(),
    staffId: text().notNull(),
    staffName: text().notNull().default(''),
    role: text().notNull(),
    date: text().notNull(),
    startTime: text().notNull(),
    endTime: text().notNull(),
    /** PENDING | CONFIRMED | DECLINED | SWAP_REQUESTED */
    status: text().notNull(),
    note: text().notNull().default(''),
    reason: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.venueId, t.date), index().on(t.staffId)],
);
