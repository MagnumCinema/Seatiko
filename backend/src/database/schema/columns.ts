import { customType, doublePrecision, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

/** Text in the three pilot languages, as the API returns it. */
export type LocalizedString = { ru: string; en: string; ro: string };

/** jsonb holding a LocalizedString. */
export const localized = (name: string) => jsonb(name).$type<LocalizedString>();

/**
 * timestamptz with microseconds (Go keeps them), read and written as strings so
 * nothing is lost; format for the API with core/time.
 */
export const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 6, mode: 'string' });

/** Latitude / longitude. */
export const coord = (name: string) => doublePrecision(name).notNull().default(0);

/** text[] that is never null (empty list by default). */
export const textList = (name: string) => text(name).array().notNull().default([]);

/** Postgres tstzrange as "[start,end)"; written by services, enforced by constraints. */
export const tstzrange = customType<{ data: string }>({ dataType: () => 'tstzrange' });
