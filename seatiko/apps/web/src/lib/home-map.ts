/**
 * Pure helpers for the home map (components/venue-map.tsx): quick filter chips,
 * "open until" from the venue hours, the visible-area list, cluster styling
 * and the phone bottom sheet snap points. No DOM, no MapLibre: unit-tested.
 */
import type { MapBounds, MapPlace, Venue } from "@/lib/api";
import { formatClock, venueHoursOn } from "@/lib/venue-hours";

/** OpenFreeMap tiles matching the site theme (home map and the venue page's location map). */
export const MAP_TILE_STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/**
 * A venue as a map place, so the venue page reuses the home map's pin and selected card.
 * `freeTables` is the live count from the floor plan when the page has it.
 */
export function venueAsMapPlace(
  venue: Pick<
    Venue,
    "id" | "name" | "address" | "lat" | "lng" | "rating" | "google_place_id" | "open_now" | "free_tables" | "hours_text" | "cuisine" | "price_level" | "average_check" | "website"
  >,
  { bookable, freeTables }: { bookable: boolean; freeTables?: number },
): MapPlace {
  return {
    id: venue.id,
    venue_id: venue.id,
    in_database: true,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    rating: venue.rating || undefined,
    google_place_id: venue.google_place_id,
    open_now: venue.open_now,
    bookable,
    free_tables: bookable ? freeTables ?? venue.free_tables : undefined,
    hours_text: venue.hours_text,
    cuisine: venue.cuisine,
    price_level: venue.price_level,
    average_check: venue.average_check,
    website: venue.website,
  };
}

/* —— Quick filter chips (M3) —— */

export type QuickFilter = "bookable" | "openNow" | "terrace" | "saved";

export const QUICK_FILTERS: readonly QuickFilter[] = ["bookable", "openNow", "terrace", "saved"];

/**
 * Terrace is not in `MapPlace` yet (BACKEND_TASKS №71). A place counts as having one
 * only when the API sends `features: ["terrace", …]`; until then the chip stays hidden.
 */
export function placeHasTerrace(place: MapPlace & { features?: string[] }): boolean {
  return Array.isArray(place.features) && place.features.includes("terrace");
}

/** The terrace chip is shown only once at least one loaded place carries the flag. */
export function terraceFilterAvailable(places: MapPlace[]): boolean {
  return places.some((place) => placeHasTerrace(place));
}

/** Whether a place belongs to the guest's favourites (local prefs + `User.favorite_venues`). */
export function isSavedPlace(place: MapPlace, saved: ReadonlySet<string>): boolean {
  return Boolean(place.venue_id && saved.has(place.venue_id));
}

/**
 * Applies the active chips on top of the places the API returned. All active chips
 * must match (AND): "Терраса" + "Открыто сейчас" means an open terrace.
 * `bookable` is also sent to the API (`bookable_only`); filtering again here keeps
 * the list right while that request is in flight.
 */
export function applyQuickFilters(
  places: MapPlace[],
  active: ReadonlySet<QuickFilter>,
  saved: ReadonlySet<string>,
): MapPlace[] {
  if (active.size === 0) return places;
  return places.filter((place) => {
    if (active.has("bookable") && !(place.in_database && place.bookable)) return false;
    if (active.has("openNow") && place.open_now !== true) return false;
    if (active.has("terrace") && !placeHasTerrace(place)) return false;
    if (active.has("saved") && !isSavedPlace(place, saved)) return false;
    return true;
  });
}

/** Toggles one chip; "Все" (null) clears them all. Returns a new set. */
export function toggleQuickFilter(
  active: ReadonlySet<QuickFilter>,
  filter: QuickFilter | null,
): Set<QuickFilter> {
  if (filter === null) return new Set();
  const next = new Set(active);
  if (next.has(filter)) next.delete(filter);
  else next.add(filter);
  return next;
}

/* —— Visible area (list ↔ map sync) —— */

export function placeInBounds(place: Pick<MapPlace, "lat" | "lng">, bounds: MapBounds): boolean {
  return place.lat >= bounds.south && place.lat <= bounds.north && place.lng >= bounds.west && place.lng <= bounds.east;
}

/**
 * Places inside the visible map area, in list order. Without bounds (map not
 * ready, Google mode) the whole list is "visible".
 */
export function placesInView<T extends Pick<MapPlace, "lat" | "lng">>(places: T[], bounds: MapBounds | null | undefined): T[] {
  if (!bounds) return places;
  return places.filter((place) => placeInBounds(place, bounds));
}

/** Validates a bounds box (south < north, west < east). */
export function validBounds(bounds: MapBounds | null | undefined): bounds is MapBounds {
  return Boolean(bounds && bounds.south < bounds.north && bounds.west < bounds.east);
}

/** Clips the visible area to the selected city or country before asking the API. */
export function clipBounds(next: MapBounds, limit: MapBounds): MapBounds {
  return {
    south: Math.max(next.south, limit.south),
    west: Math.max(next.west, limit.west),
    north: Math.min(next.north, limit.north),
    east: Math.min(next.east, limit.east),
  };
}

/** The map moved far enough from the last searched area to offer "Искать в этой области". */
export function areaChanged(current: MapBounds, searched: MapBounds, tolerance = 0.12): boolean {
  const height = Math.max(searched.north - searched.south, 1e-6);
  const width = Math.max(searched.east - searched.west, 1e-6);
  return (
    Math.abs(current.north - searched.north) / height > tolerance ||
    Math.abs(current.south - searched.south) / height > tolerance ||
    Math.abs(current.east - searched.east) / width > tolerance ||
    Math.abs(current.west - searched.west) / width > tolerance
  );
}

/* —— "Открыто · до 23:00" (popup badge) —— */

const DAY_MIN = 24 * 60;

/**
 * Closing time of a partner venue for the moment `now`, as "HH:MM", or null when
 * it is closed now / the hours are unknown. A night that runs past midnight is
 * read from the previous day (Fri 18:00–02:00 is still open at Sat 01:00).
 */
export function closingTime(
  venue: { id: string; hours_text?: string },
  now: Date,
): string | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const late = venueHoursOn(venue, yesterday);
  if (late && late.closeMin > DAY_MIN && minutes < late.closeMin - DAY_MIN) {
    return formatClock(late.closeMin - DAY_MIN);
  }
  const today = venueHoursOn(venue, now);
  if (!today) return null;
  if (today.closeMin - today.openMin >= DAY_MIN) return null; // round the clock: no "until"
  if (minutes < today.openMin || minutes >= today.closeMin) return null;
  return formatClock(today.closeMin % DAY_MIN);
}

/* —— Pins and clusters (M1, QW5) —— */

/** Short pin label: the first word, or two when the first is tiny ("La Plăcinte"). */
export function shortPinName(name: string, max = 14): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let label = words[0];
  if (label.length <= 3 && words[1]) label = `${label} ${words[1]}`;
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** Cluster bubble radius (px) by point count: 34 / 42 / 52 px circles as in the mockup. */
export function clusterRadius(count: number): number {
  if (count >= 25) return 26;
  if (count >= 10) return 21;
  return 17;
}

/* —— Phone bottom sheet (M4) —— */

export type SheetSnap = "peek" | "half" | "full";
export const SHEET_SNAPS: readonly SheetSnap[] = ["peek", "half", "full"];

/** Sheet heights (px) for a map canvas of `canvasHeight` px. */
export function sheetHeights(canvasHeight: number): Record<SheetSnap, number> {
  const h = Math.max(canvasHeight, 320);
  const peek = 148;
  const full = Math.round(h - 56);
  const half = Math.round(Math.min(Math.max(h * 0.52, peek + 120), full - 80));
  return { peek, half, full };
}

/**
 * Where a drag ends: a quick flick (|velocity| > 0.5 px/ms, positive = up) moves one
 * step in its direction, otherwise the nearest snap height wins.
 */
export function nearestSnap(
  height: number,
  heights: Record<SheetSnap, number>,
  velocity = 0,
  from?: SheetSnap,
): SheetSnap {
  if (from && Math.abs(velocity) > 0.5) {
    const index = SHEET_SNAPS.indexOf(from);
    const step = velocity > 0 ? 1 : -1;
    return SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + step))];
  }
  let best: SheetSnap = "peek";
  let bestDistance = Infinity;
  for (const snap of SHEET_SNAPS) {
    const distance = Math.abs(heights[snap] - height);
    if (distance < bestDistance) {
      best = snap;
      bestDistance = distance;
    }
  }
  return best;
}

/** Plural form of a count with Intl rules (RU/EN/RO). */
export function pluralForm<T extends { one: string; few: string; many: string; other: string }>(
  forms: T,
  locale: string,
  count: number,
): string {
  const rule = new Intl.PluralRules(locale).select(count);
  return rule === "one" || rule === "few" || rule === "many" ? forms[rule] : forms.other;
}
