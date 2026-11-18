import type { Venue } from "@/lib/api";
import type { VenueAvailability } from "@/lib/venue-availability";

export type QuickBookRow = {
  venue: Venue;
  availability: VenueAvailability;
  laterToday: VenueAvailability | null;
  rank: number;
};

export type EmptyKind = "search-miss" | "too-small-all" | "no-slots";

export function partitionQuickBookResults({
  results,
  searching,
  textMatchIds,
}: {
  results: QuickBookRow[];
  searching: boolean;
  queryText: string;
  textMatchIds?: Set<string>;
}): {
  matched: QuickBookRow[];
  available: QuickBookRow[];
  unavailable: QuickBookRow[];
  tooSmall: QuickBookRow[];
  cards: QuickBookRow[];
} {
  const matched = searching
    ? results.filter((r) => textMatchIds?.has(r.venue.id))
    : results;
  const available = matched.filter((r) => r.availability.slots.length > 0);
  const unavailable = matched.filter((r) => r.availability.fits && r.availability.slots.length === 0);
  const tooSmall = matched.filter((r) => !r.availability.fits);
  const cards = searching ? matched : available;
  return { matched, available, unavailable, tooSmall, cards };
}

export function emptyKind(input: {
  loading: boolean;
  failed: boolean;
  searching: boolean;
  matchedCount: number;
  availableCount: number;
  tooSmallCount: number;
  resultsCount: number;
}): EmptyKind | null {
  if (input.loading || input.failed) return null;
  if (input.searching && input.matchedCount === 0) return "search-miss";
  if (!input.searching && input.availableCount === 0 && input.resultsCount > 0) {
    if (input.tooSmallCount === input.resultsCount) return "too-small-all";
    return "no-slots";
  }
  return null;
}
