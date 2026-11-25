import { boolean, doublePrecision, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { localized, ts } from './columns.js';
import { cities } from './geo.js';

export type VenueReview = { author: string; rating: number; text: string; relative_time?: string; source?: string; profile_url?: string };

export const venues = pgTable(
  'venues',
  {
    id: text('id').primaryKey(),
    cityId: text('city_id').notNull().references(() => cities.id),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    address: localized('address').notNull(),
    cuisine: text('cuisine').array().notNull().default([]),
    rating: doublePrecision('rating').notNull().default(0),
    reviewCount: integer('review_count').notNull().default(0),
    priceLevel: integer('price_level').notNull().default(0),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    averageCheck: integer('average_check').notNull().default(0),
    openNow: boolean('open_now').notNull().default(true),
    imageUrl: text('image_url').notNull().default(''),
    photoUrls: text('photo_urls').array().notNull().default([]),
    phone: text('phone').notNull().default(''),
    website: text('website').notNull().default(''),
    googlePlaceId: text('google_place_id').notNull().default(''),
    reviews: jsonb('reviews').$type<VenueReview[]>().notNull().default([]),
    alcoholLicense: boolean('alcohol_license_valid').notNull().default(false),
    hoursText: text('hours_text').notNull().default(''),
    // Booking rules (0 = default, see availability rules).
    sessionStartBeforeMin: integer('session_start_before_min').notNull().default(0),
    releaseBeforeMin: integer('release_before_min').notNull().default(0),
    bookingIntervalMin: integer('booking_interval_min').notNull().default(0),
    holdMinutes: integer('hold_minutes').notNull().default(15),
    maxLateArrivalMin: integer('max_late_arrival_min').notNull().default(0),
    visitDurationMin: integer('visit_duration_min').notNull().default(0),
    maxVisitDurationMin: integer('max_visit_duration_min').notNull().default(0),
    allowPreorder: boolean('allow_preorder').notNull().default(false),
    preorderLeadMin: integer('preorder_lead_min').notNull().default(0),
  },
  (t) => [index('venues_city_idx').on(t.cityId)],
);

export const venueTables = pgTable(
  'venue_tables',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    seats: integer('seats').notNull(),
    status: text('status').notNull().default('FREE'),
    occupiedSince: ts('occupied_since'),
    reservedFor: ts('reserved_for'),
    reservationId: text('reservation_id'),
    x: doublePrecision('x').notNull().default(0),
    y: doublePrecision('y').notNull().default(0),
    zone: text('zone').notNull().default('hall'),
    qrToken: text('qr_token').notNull().default(''),
  },
  (t) => [index('venue_tables_venue_idx').on(t.venueId)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    category: localized('category').notNull(),
    name: localized('name').notNull(),
    description: localized('description').notNull(),
    ingredients: localized('ingredients'),
    allergens: text('allergens').array().notNull().default([]),
    price: integer('price').notNull(),
    weightG: integer('weight_g').notNull().default(0),
    volumeMl: integer('volume_ml').notNull().default(0),
    imageUrl: text('image_url').notNull().default(''),
    containsAlcohol: boolean('contains_alcohol').notNull().default(false),
    requiresAge18: boolean('requires_age_18').notNull().default(false),
    tags: text('tags').array().notNull().default([]),
    position: integer('position').notNull().default(0),
    stopped: boolean('stopped').notNull().default(false),
  },
  (t) => [index('menu_items_venue_idx').on(t.venueId)],
);
