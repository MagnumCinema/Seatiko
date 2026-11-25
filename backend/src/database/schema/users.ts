import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { textList, ts } from './columns.js';

/** Who confirmed the guest is 18+, where and when (APP_LOGIC §8.4); read-only for the guest. */
export type AdultVerification = {
  verified_at: string;
  verified_by_staff_id: string;
  verified_by_staff_role: string;
  verified_by_staff_display_name: string;
  verified_at_venue_id: string;
  id_document_checked: boolean;
  id_document_type: string;
  revoked_at?: string;
  revoked_by_staff_id?: string;
};

export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    email: text().notNull(),
    passwordHash: text().notNull().default(''),
    phone: text().notNull().default(''),
    firstName: text().notNull().default(''),
    lastName: text().notNull().default(''),
    displayName: text().notNull().default(''),
    locale: text().notNull().default('ru'),
    /** guest | restaurant | staff | admin */
    role: text().notNull().default('guest'),
    dietPreferences: textList('diet_preferences'),
    favoriteVenues: textList('favorite_venues'),
    avatarUrl: text().notNull().default(''),
    avatarKey: text().notNull().default(''),
    adultPreorderAllowed: boolean().notNull().default(false),
    adultVerification: jsonb().$type<AdultVerification>(),
    /** GDPR deletion: the row stays as an anonymous stub. */
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_idx').using('btree', sql`lower(${t.email})`), index().on(t.role)],
);

/**
 * Accounts at other providers that sign a user in (Sign in with Google), found by the
 * provider's id for the account (`sub`), never by email: emails change, `sub` does not.
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    /** google */
    provider: text().notNull(),
    /** Google's `sub`: stable for the life of the Google account. */
    subject: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Address the provider reported, shown to the user only. */
    email: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    // One user per provider account: two first sign-ins cannot create two users.
    primaryKey({ columns: [t.provider, t.subject] }),
    // At most one account per provider for each user.
    unique('user_identities_user_provider_key').on(t.userId, t.provider),
  ],
);

/** Append-only audit of 18+ grants and revokes. */
export const adultPermissionLog = pgTable(
  'adult_permission_log',
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    /** GRANT | REVOKE */
    action: text().notNull(),
    staffId: text().notNull(),
    staffRole: text().notNull(),
    staffDisplayName: text().notNull(),
    venueId: text().notNull(),
    reservationId: text().notNull().default(''),
    idDocumentChecked: boolean().notNull().default(false),
    idDocumentType: text().notNull().default(''),
    reason: text().notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/** In-app notifications (APP_LOGIC §13); live delivery goes through SSE. */
export const notifications = pgTable(
  'notifications',
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    kind: text().notNull(),
    venueId: text().notNull().default(''),
    reservationId: text().notNull().default(''),
    orderId: text().notNull().default(''),
    at: ts('at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    readAt: ts('read_at'),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
