import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { localized, type Coordinates, type MapBounds } from './columns.js';

export const cities = pgTable('cities', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: localized('name').notNull(),
  available: boolean('available').notNull().default(false),
  country: text('country').notNull(),
  center: jsonb('center').$type<Coordinates>().notNull(),
  bounds: jsonb('bounds').$type<MapBounds>().notNull(),
});

/** Curated sets of venues for the landing page (holidays, date night…). */
export const collections = pgTable('collections', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: localized('title').notNull(),
  venueIds: text('venue_ids').array().notNull().default([]),
});
