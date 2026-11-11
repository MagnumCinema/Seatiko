/** Deep links that open the booking dialogs on the venue page (`/venues/[id]?book=…`). */

export type BookingIntent = "quick" | "event";

export type BookingLinkOptions = {
  intent?: BookingIntent;
  /** Preferred start time (ISO string or Date). */
  time?: string | Date;
  guests?: number;
  durationMin?: number;
};

export type BookingLinkParams = {
  intent: BookingIntent | null;
  time: string | null;
  guests: number | null;
  durationMin: number | null;
};

const MAX_GUESTS = 40;
const MAX_DURATION_MIN = 12 * 60;

function positiveInt(value: string | null, max: number): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Link to the venue page that opens the quick-booking (or celebration) dialog. */
export function venueBookingHref(venueId: string, options: BookingLinkOptions = {}): string {
  const params = new URLSearchParams();
  params.set("book", options.intent === "event" ? "event" : "1");
  if (options.time) {
    const date = options.time instanceof Date ? options.time : new Date(options.time);
    if (!Number.isNaN(date.getTime())) params.set("time", date.toISOString());
  }
  if (options.guests && options.guests > 0) params.set("guests", String(Math.round(options.guests)));
  if (options.durationMin && options.durationMin > 0) {
    params.set("duration", String(Math.round(options.durationMin)));
  }
  return `/venues/${encodeURIComponent(venueId)}?${params.toString()}`;
}

/** Reads `book`, `time`, `guests`, `duration` from the venue page URL; invalid values become null. */
export function parseBookingParams(search: Pick<URLSearchParams, "get">): BookingLinkParams {
  const book = search.get("book");
  const intent: BookingIntent | null =
    book === "event" ? "event" : book === "1" || book === "quick" ? "quick" : null;
  const rawTime = search.get("time");
  const time = rawTime && !Number.isNaN(new Date(rawTime).getTime()) ? new Date(rawTime).toISOString() : null;
  return {
    intent,
    time,
    guests: positiveInt(search.get("guests"), MAX_GUESTS),
    durationMin: positiveInt(search.get("duration"), MAX_DURATION_MIN),
  };
}

/** URL without the booking params (so closing the dialog and reloading doesn't reopen it). */
export function stripBookingParams(href: string): string {
  const url = new URL(href);
  for (const key of ["book", "time", "guests", "duration"]) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
