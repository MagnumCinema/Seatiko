// Restaurant application rules, ported from store/memory.go (UpdateApplication,
// applicationComplete) and ops.go (profile change requests).
import type { LocalizedString } from '../../../database/schema/columns.js';
import type { ApplicationPatch } from '../../../database/schema/restaurant.js';
import { isVenueType } from '../../venue-roles/domain/role-presets.js';

export const MAX_APPLICATION_PHOTOS = 8;
export const MOLDOVA = { south: 45.45, west: 26.6, north: 48.55, east: 30.2 };
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

/** The profile fields of an application as stored. */
export type Profile = {
  name: LocalizedString;
  description: LocalizedString;
  address: LocalizedString;
  cuisine: string[];
  venueType: string;
  phone: string;
  email: string;
  website: string;
  cityId: string;
  lat: number;
  lng: number;
  priceLevel: number;
  averageCheck: number;
  hoursText: string;
  photoUrls: string[];
};

const sameText = (a: LocalizedString, b: LocalizedString) => a.ru === b.ru && a.en === b.en && a.ro === b.ro;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const filled = (s: LocalizedString) => Boolean(s.ru.trim() || s.en.trim() || s.ro.trim());

export function validEmail(email: string): boolean {
  return EMAIL.test(email.trim());
}

/** http(s) URL with a host. */
export function validWebsite(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
  } catch {
    return false;
  }
}

/** Field checks of an owner's edit; `knownCity` tells whether a Moldovan city id exists. False = invalid_fields. */
export function validPatch(p: ApplicationPatch, current: Pick<Profile, 'cityId'>, knownCity: (id: string) => boolean): boolean {
  if (p.venue_type !== undefined && p.venue_type !== '' && !isVenueType(p.venue_type)) return false;
  if (p.email && !validEmail(p.email)) return false;
  if (p.website && !validWebsite(p.website)) return false;
  if (p.city_id !== undefined && p.city_id !== current.cityId && !knownCity(p.city_id)) return false;
  if (p.lat !== undefined && (p.lat < -90 || p.lat > 90)) return false;
  if (p.lng !== undefined && (p.lng < -180 || p.lng > 180)) return false;
  if (p.price_level !== undefined && (p.price_level < 1 || p.price_level > 3)) return false;
  if (p.average_check !== undefined && p.average_check < 0) return false;
  return true;
}

/** Applies a patch; returns the new profile and the stable keys of what changed (for the activity journal). */
export function applyPatch(cur: Profile, p: ApplicationPatch): { next: Profile; changed: string[] } {
  const next = { ...cur };
  const changed: string[] = [];
  const set = <K extends keyof Profile>(key: K, value: Profile[K] | undefined, label: string, same: (a: Profile[K], b: Profile[K]) => boolean) => {
    if (value === undefined || same(cur[key], value)) return;
    next[key] = value;
    changed.push(label);
  };
  const eq = <T>(a: T, b: T) => a === b;
  set('name', p.name, 'name', sameText);
  set('description', p.description, 'description', sameText);
  set('address', p.address, 'address', sameText);
  set('cuisine', p.cuisine, 'cuisine', sameList);
  set('venueType', p.venue_type, 'venue_type', eq);
  set('phone', p.phone, 'phone', eq);
  set('email', p.email, 'email', eq);
  set('website', p.website, 'website', eq);
  set('cityId', p.city_id || undefined, 'city', eq);
  set('lat', p.lat, 'latitude', eq);
  set('lng', p.lng, 'longitude', eq);
  set('priceLevel', p.price_level, 'price_level', eq);
  set('averageCheck', p.average_check, 'average_check', eq);
  set('hoursText', p.hours_text, 'hours', eq);
  return { next, changed };
}

/** Everything a venue needs before moderation (applicationComplete). */
export function applicationComplete(a: Profile): boolean {
  const inMoldova = a.lat >= MOLDOVA.south && a.lat <= MOLDOVA.north && a.lng >= MOLDOVA.west && a.lng <= MOLDOVA.east;
  return (
    filled(a.name) &&
    filled(a.description) &&
    filled(a.address) &&
    a.cuisine.length > 0 &&
    a.phone.trim() !== '' &&
    validEmail(a.email) &&
    a.hoursText.trim() !== '' &&
    inMoldova &&
    a.photoUrls.length > 0
  );
}

/** Admin moves: UNDER_REVIEW, APPROVED or REJECTED (with a reason). */
export const REVIEW_STATUSES = ['UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const reviewAction = (status: string) =>
  status === 'APPROVED' ? 'APPLICATION_APPROVED' : status === 'REJECTED' ? 'APPLICATION_REJECTED' : 'REVIEW_STARTED';

/** Starting floor plan of a published venue without tables of its own. */
export const DEFAULT_LAYOUT = [
  { x: 0.18, y: 0.22, seats: 2, zone: 'hall' },
  { x: 0.43, y: 0.22, seats: 4, zone: 'hall' },
  { x: 0.72, y: 0.22, seats: 4, zone: 'hall' },
  { x: 0.22, y: 0.5, seats: 4, zone: 'hall' },
  { x: 0.52, y: 0.5, seats: 6, zone: 'hall' },
  { x: 0.28, y: 0.35, seats: 2, zone: 'terrace' },
  { x: 0.55, y: 0.4, seats: 4, zone: 'terrace' },
  { x: 0.78, y: 0.55, seats: 4, zone: 'street' },
  { x: 0.42, y: 0.7, seats: 6, zone: 'street' },
];
