import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { ts } from './columns.js';

/** Who confirmed the guest is 18+, where and when (APP_LOGIC §8.4). */
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
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    phone: text('phone').notNull().default(''),
    passwordHash: text('password_hash').notNull().default(''),
    firstName: text('first_name').notNull().default(''),
    lastName: text('last_name').notNull().default(''),
    displayName: text('display_name').notNull().default(''),
    locale: text('locale').notNull().default('ru'),
    role: text('role').notNull(),
    dietPreferences: text('diet_preferences').array().notNull().default([]),
    favoriteVenues: text('favorite_venues').array().notNull().default([]),
    avatarUrl: text('avatar_url'),
    avatarKey: text('avatar_key'),
    adultPreorderAllowed: boolean('adult_preorder_allowed').notNull().default(false),
    adultVerification: jsonb('adult_verification').$type<AdultVerification>(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`), index('users_role_idx').on(t.role)],
);
