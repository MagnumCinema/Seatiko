import { jsonb, timestamp } from 'drizzle-orm/pg-core';

/** Text in the three pilot languages, as the API returns it. */
export type LocalizedString = { ru: string; en: string; ro: string };
export type Coordinates = { lat: number; lng: number };
export type MapBounds = { south: number; west: number; north: number; east: number };

/** jsonb column holding LocalizedString. */
export const localized = (name: string) => jsonb(name).$type<LocalizedString>();

/** timestamptz with millisecond precision, read as Date. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
