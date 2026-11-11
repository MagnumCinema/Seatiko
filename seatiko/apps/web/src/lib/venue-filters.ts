import type { Venue } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";

export const VENUE_FILTER_IDS = [
  "all",
  "available",
  "top_rated",
  "moldovan",
  "european",
  "grill",
  "pizza",
  "bakery",
  "wine",
] as const;

export type VenueFilter = (typeof VENUE_FILTER_IDS)[number];

export const TOP_RATED_MIN = 4.8;

const CUISINE_GROUPS: Partial<Record<VenueFilter, readonly string[]>> = {
  moldovan: ["moldovan"],
  european: ["european", "mediterranean"],
  grill: ["grill", "meat", "pub", "steak"],
  pizza: ["pizza", "italian"],
  bakery: ["bakery", "cafe", "coffee", "dessert"],
  wine: ["wine", "bar"],
};

export function isVenueFilter(value: string | null | undefined): value is VenueFilter {
  return !!value && (VENUE_FILTER_IDS as readonly string[]).includes(value);
}

export function matchesVenueFilter(venue: Venue, filter: VenueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "available") return venue.free_tables > 0;
  if (filter === "top_rated") return venue.rating >= TOP_RATED_MIN;
  const group = CUISINE_GROUPS[filter] ?? [];
  return (venue.cuisine ?? []).some((code) => group.includes(code));
}

// Cuisine codes are matched by their labels in every locale, so "пицца" finds `pizza`
// regardless of the current UI language.
const CUISINE_SEARCH_TERMS: Record<string, string> = (() => {
  const terms: Record<string, string[]> = {};
  for (const locale of ["ru", "en", "ro"] as const) {
    const copy = getSiteCopy(locale);
    const labels: Record<string, string> = {
      ...copy.discover.chips,
      ...copy.catalog.cuisines,
    };
    for (const [code, label] of Object.entries(labels)) {
      (terms[code] ??= [code]).push(label);
    }
  }
  return Object.fromEntries(
    Object.entries(terms).map(([code, list]) => [code, list.join(" ").toLowerCase()]),
  );
})();

export function matchesVenueQuery(venue: Venue, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const fields = [venue.name, venue.description, venue.address].flatMap((value) =>
    value ? [value.ru, value.en, value.ro] : [],
  );
  const cuisines = (venue.cuisine ?? []).map((code) => CUISINE_SEARCH_TERMS[code] ?? code);
  return [...fields, ...cuisines].some((text) => (text ?? "").toLowerCase().includes(query));
}
