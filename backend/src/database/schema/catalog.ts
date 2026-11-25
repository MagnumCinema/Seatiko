import { boolean, doublePrecision, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { coord, localized, textList, ts } from './columns.js';

export const cities = pgTable('cities', {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: localized('name').notNull(),
  available: boolean().notNull().default(false),
  country: text().notNull().default('MD'),
  center: jsonb().$type<{ lat: number; lng: number }>().notNull(),
  bounds: jsonb().$type<{ south: number; west: number; north: number; east: number }>().notNull(),
});

export type VenueReview = { author: string; rating: number; text: string; relative_time?: string; source?: string; profile_url?: string };

export const venues = pgTable(
  'venues',
  {
    id: text().primaryKey(),
    cityId: text().notNull().references(() => cities.id),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    cuisine: textList('cuisine'),
    /** Venue format (restaurant, cafe, bar…); '' = not set. */
    venueType: text().notNull().default(''),
    rating: doublePrecision().notNull().default(0),
    reviewCount: integer().notNull().default(0),
    priceLevel: integer().notNull().default(0),
    address: localized('address').notNull(),
    lat: coord('lat'),
    lng: coord('lng'),
    averageCheck: integer().notNull().default(0),
    openNow: boolean().notNull().default(true),
    imageUrl: text().notNull().default(''),
    photoUrls: textList('photo_urls'),
    phone: text().notNull().default(''),
    website: text().notNull().default(''),
    googlePlaceId: text().notNull().default(''),
    reviews: jsonb().$type<VenueReview[]>().notNull().default([]),
    alcoholLicense: boolean().notNull().default(false),
    // Booking rules (minutes; 0 = default), see booking_rules in the Go store.
    sessionStartBeforeMin: integer().notNull().default(0),
    releaseBeforeMin: integer().notNull().default(0),
    bookingIntervalMin: integer().notNull().default(0),
    holdMinutes: integer().notNull().default(0),
    maxLateArrivalMin: integer().notNull().default(0),
    visitDurationMin: integer().notNull().default(0),
    maxVisitDurationMin: integer().notNull().default(0),
    allowPreorder: boolean().notNull().default(false),
    preorderLeadMin: integer().notNull().default(0),
    hoursText: text().notNull().default(''),
  },
  (t) => [index().on(t.cityId)],
);

export const tables = pgTable(
  'tables',
  {
    id: text().primaryKey(),
    venueId: text().notNull().references(() => venues.id, { onDelete: 'cascade' }),
    number: integer().notNull(),
    seats: integer().notNull(),
    /** FREE | RESERVED | OCCUPIED | CLEANING — live floor state. */
    status: text().notNull().default('FREE'),
    x: doublePrecision().notNull().default(0),
    y: doublePrecision().notNull().default(0),
    zone: text().notNull().default('hall'),
    occupiedSince: ts('occupied_since'),
    reservedFor: ts('reserved_for'),
    reservationId: text(),
    qrToken: text().notNull().default(''),
  },
  (t) => [index().on(t.venueId)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text().primaryKey(),
    venueId: text().notNull().references(() => venues.id, { onDelete: 'cascade' }),
    category: localized('category').notNull(),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    ingredients: localized('ingredients'),
    allergens: textList('allergens'),
    price: integer().notNull(),
    weightG: integer().notNull().default(0),
    volumeMl: integer().notNull().default(0),
    imageUrl: text().notNull().default(''),
    containsAlcohol: boolean().notNull().default(false),
    requiresAge18: boolean('requires_age_18').notNull().default(false),
    tags: textList('tags'),
    position: integer().notNull().default(0),
    stopped: boolean().notNull().default(false),
  },
  (t) => [index().on(t.venueId)],
);

export const collections = pgTable('collections', {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: localized('title').notNull(),
  venueIds: textList('venue_ids'),
  position: integer().notNull().default(0),
});

/** Small key/value settings (e.g. demo_menu_version). */
export const appMeta = pgTable('app_meta', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
