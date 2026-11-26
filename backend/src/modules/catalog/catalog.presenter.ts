// Database rows → the JSON the Go API returns (same field names, omitempty fields left out).
import type { LocalizedString } from '../../database/schema/columns.js';
import { formatDbTime } from '../../core/time/time.js';
import type { ApplicationRecord, CityRecord, MenuItemRecord, TableRecord, VenueRecord } from './catalog.repository.js';
import {
  DEFAULT_BOOKING_INTERVAL_MIN,
  DEFAULT_HOLD_MINUTES,
  DEFAULT_MAX_VISIT_DURATION_MIN,
  DEFAULT_VISIT_DURATION_MIN,
} from './domain/booking-rules.js';

const EMPTY: LocalizedString = { ru: '', en: '', ro: '' };
/** Go's omitempty: drop empty strings, empty lists, false and undefined. */
const omitEmpty = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

export function presentCity(c: CityRecord) {
  return { id: c.id, slug: c.slug, name: c.name, available: c.available, country: c.country, center: c.center, bounds: c.bounds };
}

export function presentVenue(v: VenueRecord) {
  return {
    id: v.id,
    city_id: v.cityId,
    name: v.name,
    description: v.description,
    cuisine: v.cuisine,
    rating: v.rating,
    review_count: v.reviewCount,
    price_level: v.priceLevel,
    address: v.address,
    lat: v.lat,
    lng: v.lng,
    average_check: v.averageCheck,
    open_now: v.openNow,
    free_tables: v.freeTables,
    image_url: v.imageUrl,
    ...omitEmpty({ venue_type: v.venueType, photo_urls: v.photoUrls, phone: v.phone, website: v.website, google_place_id: v.googlePlaceId, reviews: v.reviews }),
    alcohol_license_valid: v.alcoholLicense,
    session_start_before_min: v.sessionStartBeforeMin,
    release_before_min: v.releaseBeforeMin,
    booking_interval_min: v.bookingIntervalMin,
    hold_minutes: v.holdMinutes,
    max_late_arrival_min: v.maxLateArrivalMin,
    visit_duration_min: v.visitDurationMin,
    max_visit_duration_min: v.maxVisitDurationMin,
    allow_preorder: v.allowPreorder,
    preorder_lead_min: v.preorderLeadMin,
    ...omitEmpty({ hours_text: v.hoursText }),
  };
}

/** Preview of a not yet published application, as venueFromApplicationLocked in Go. */
export function venueFromApplication(app: ApplicationRecord): VenueRecord {
  const or = (v: number, d: number) => v || d;
  return {
    id: app.id,
    cityId: app.cityId || 'city-balti',
    name: app.name,
    description: app.description,
    cuisine: app.cuisine ?? [],
    venueType: app.venueType ?? '',
    rating: 0,
    reviewCount: 0,
    priceLevel: app.priceLevel,
    address: app.address,
    lat: app.lat,
    lng: app.lng,
    averageCheck: app.averageCheck,
    openNow: true,
    imageUrl: app.photoUrls[0] ?? '',
    photoUrls: app.photoUrls,
    phone: '',
    website: app.website,
    googlePlaceId: '',
    reviews: [],
    alcoholLicense: false,
    sessionStartBeforeMin: or(app.sessionStartBeforeMin, 60),
    releaseBeforeMin: or(app.releaseBeforeMin, 15),
    bookingIntervalMin: or(app.bookingIntervalMin, DEFAULT_BOOKING_INTERVAL_MIN),
    holdMinutes: or(app.holdMinutes, DEFAULT_HOLD_MINUTES),
    maxLateArrivalMin: or(app.maxLateArrivalMin, 30),
    visitDurationMin: or(app.visitDurationMin, DEFAULT_VISIT_DURATION_MIN),
    maxVisitDurationMin: or(app.maxVisitDurationMin, DEFAULT_MAX_VISIT_DURATION_MIN),
    allowPreorder: app.allowPreorder,
    preorderLeadMin: 0,
    hoursText: '',
    freeTables: 0,
  };
}

/** Public table (no QR token). */
export function presentTable(t: TableRecord) {
  return {
    id: t.id,
    venue_id: t.venueId,
    number: t.number,
    seats: t.seats,
    status: t.status,
    ...omitEmpty({
      occupied_since: t.occupiedSince ? formatDbTime(t.occupiedSince) : undefined,
      reserved_for: t.reservedFor ? formatDbTime(t.reservedFor) : undefined,
      reservation_id: t.reservationId ?? undefined,
    }),
    x: t.x,
    y: t.y,
    zone: t.zone || 'hall',
  };
}

export function presentMenuItem(m: MenuItemRecord) {
  return {
    id: m.id,
    venue_id: m.venueId,
    category: m.category,
    name: m.name,
    description: m.description,
    // Go's omitempty does not drop a struct: ingredients is always present.
    ingredients: m.ingredients ?? EMPTY,
    ...omitEmpty({ allergens: m.allergens }),
    price: m.price,
    ...omitEmpty({ weight_g: m.weightG || undefined, volume_ml: m.volumeMl || undefined, image_url: m.imageUrl }),
    contains_alcohol: m.containsAlcohol,
    requires_age_18: m.requiresAge18,
    ...omitEmpty({ tags: m.tags, position: m.position || undefined }),
    stopped: m.stopped,
  };
}

/** Seeded order first (by position), dishes added later after them, by id. */
export function sortMenu<T extends { position: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if ((a.position === 0) !== (b.position === 0)) return a.position === 0 ? 1 : -1;
    if (a.position !== b.position) return a.position - b.position;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
