export type PluralForms = { one: string; few: string; many: string; other: string };

const PLURAL_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", ro: "ro-RO" };

/** Picks the grammatical form for `count` (1 запись / 2 записи / 5 записей). */
export function pluralize(count: number, forms: PluralForms, locale: string): string {
  const rule = new Intl.PluralRules(PLURAL_LOCALES[locale] ?? "en-US").select(count);
  if (rule === "one" || rule === "few" || rule === "many") return forms[rule];
  return forms.other;
}

export type VenueContactErrors = Partial<Record<"email" | "website" | "phone", "invalid">>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

/** Client-side check of the venue contact fields; empty values are left to the readiness checklist. */
export function validateVenueContacts(input: {
  email: string;
  website: string;
  phone: string;
}): VenueContactErrors {
  const errors: VenueContactErrors = {};
  const email = input.email.trim();
  const website = input.website.trim();
  const phone = input.phone.trim();
  if (email && !EMAIL_RE.test(email)) errors.email = "invalid";
  if (website) {
    let ok = false;
    try {
      const url = new URL(website);
      ok = (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
    } catch {
      ok = false;
    }
    if (!ok) errors.website = "invalid";
  }
  if (phone && (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 7)) errors.phone = "invalid";
  return errors;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function photoProblem(file: { size: number; type: string }): "type" | "size" | null {
  if (!PHOTO_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "size";
  return null;
}

export type ReservationFilter = "upcoming" | "history" | "all";

type BookingLike = { reserved_for: string; status: string };

export function isHistoryBooking(booking: BookingLike, now: number): boolean {
  return (
    new Date(booking.reserved_for).getTime() < now ||
    booking.status === "CANCELLED" ||
    booking.status === "NO_SHOW"
  );
}

/**
 * Filters bookings for a tab and orders them the way staff read them:
 * upcoming — soonest first; history and "all" — newest first.
 */
export function filterReservations<T extends BookingLike>(
  bookings: T[],
  filter: ReservationFilter,
  now: number,
): T[] {
  const list = bookings.filter((booking) => {
    if (filter === "all") return true;
    const history = isHistoryBooking(booking, now);
    return filter === "history" ? history : !history;
  });
  const time = (b: T) => new Date(b.reserved_for).getTime();
  return list.sort((a, b) => (filter === "upcoming" ? time(a) - time(b) : time(b) - time(a)));
}
