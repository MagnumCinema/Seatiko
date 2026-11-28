import type { Locale } from "@/components/locale-provider";
import type { Table, Venue, VenueReview } from "@/lib/api";

/**
 * Can guests book this venue online? Until GET /venues/:id sends `bookable`
 * (BACKEND_TASKS №60), a venue with no tables in Seatiko is not bookable.
 */
export function isVenueBookable(
  venue: Pick<Venue, "bookable">,
  tables: readonly Pick<Table, "id">[],
): boolean {
  if (typeof venue.bookable === "boolean") return venue.bookable && tables.length > 0;
  return tables.length > 0;
}

const CYRILLIC = /[Ѐ-ӿ]/g;
const LETTER = /\p{L}/gu;

/** Is the text written mostly in Cyrillic (Russian seed and Google reviews)? */
export function isMostlyCyrillic(text: string): boolean {
  const letters = text.match(LETTER)?.length ?? 0;
  if (letters === 0) return false;
  return (text.match(CYRILLIC)?.length ?? 0) / letters > 0.5;
}

/**
 * Is this text readable in the active language? Reviews have no language tag yet
 * (BACKEND_TASKS №61), so Cyrillic text is shown only in RU and Latin text only in EN/RO.
 */
export function textFitsLocale(text: string, locale: Locale): boolean {
  if (!text.trim()) return false;
  return isMostlyCyrillic(text) === (locale === "ru");
}

/** Reviews whose text the guest can read in the active language. */
export function reviewsForLocale<T extends Pick<VenueReview, "text">>(
  reviews: readonly T[],
  locale: Locale,
): T[] {
  return reviews.filter((review) => textFitsLocale(review.text, locale));
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * When the review was written, in the active language: from the ISO date when the
 * API sends one, else the API's own relative line only if it is in the same language.
 */
export function reviewTimeLabel(
  review: Pick<VenueReview, "relative_time" | "published_at">,
  locale: Locale,
  now: Date = new Date(),
): string | null {
  if (review.published_at) {
    const at = new Date(review.published_at);
    if (!Number.isNaN(at.getTime())) {
      const diff = at.getTime() - now.getTime();
      const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      for (const [unit, ms] of RELATIVE_STEPS) {
        if (Math.abs(diff) >= ms || unit === "minute") {
          return format.format(Math.round(diff / ms), unit);
        }
      }
    }
  }
  const relative = review.relative_time?.trim();
  return relative && textFitsLocale(relative, locale) ? relative : null;
}

/** Add or remove a venue in a favorites id list, keeping the order of the rest. */
export function toggleFavoriteId(ids: readonly string[], venueId: string): string[] {
  return ids.includes(venueId) ? ids.filter((id) => id !== venueId) : [...ids, venueId];
}
