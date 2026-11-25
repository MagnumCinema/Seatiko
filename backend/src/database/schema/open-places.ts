import { doublePrecision, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { venues } from './catalog.js';
import { localized, textList, ts } from './columns.js';

/**
 * Cafes, restaurants and bars of Moldova from open datasets (OpenStreetMap, ODbL;
 * Overture Maps Places, CDLA Permissive 2.0), merged so one real place is one row.
 * They show on the map as not-yet-partner places; a partner venue at the same spot
 * links the row (venue_id) and is shown instead. Refreshed by the open-places import.
 */
export const openPlaces = pgTable(
  'open_places',
  {
    /** Key of the preferred source record: "osm:n123", "osm:w45", "ovt:<uuid>". */
    id: text().primaryKey(),
    name: localized('name').notNull(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    address: localized('address').notNull(),
    /** restaurant | cafe | bar | pub | fast_food | bakery | ice_cream | coffee_shop */
    category: text().notNull(),
    cuisine: textList('cuisine'),
    /** OSM opening_hours syntax, e.g. "Mo-Su 10:00-22:00"; empty when unknown. */
    openingHours: text().notNull().default(''),
    phone: text().notNull().default(''),
    website: text().notNull().default(''),
    osmId: text(),
    overtureId: text(),
    /** Which datasets describe it: osm, overture. */
    sources: textList('sources'),
    /** Overture confidence (0–1); 1 for OSM-only rows. */
    confidence: doublePrecision().notNull().default(1),
    /** Partner venue at the same place, if any. */
    venueId: text().references(() => venues.id, { onDelete: 'set null' }),
    /** Last import that still saw it; rows not seen for a while are removed. */
    seenAt: ts('seen_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.lat, t.lng), index().on(t.venueId)],
);

/** One run of the import, for the "updated" line and the refresh schedule. */
export const openPlaceImports = pgTable('open_place_imports', {
  id: text().primaryKey(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  /** running | done | failed */
  status: text().notNull(),
  /** City slugs this run covered. */
  cities: textList('cities'),
  osmCount: integer().notNull().default(0),
  overtureCount: integer().notNull().default(0),
  placeCount: integer().notNull().default(0),
  /** Overture release used, e.g. 2026-11-18.0. */
  overtureRelease: text().notNull().default(''),
  error: text().notNull().default(''),
});
