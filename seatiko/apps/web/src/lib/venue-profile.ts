import type { ApplicationUpdate, LocaleCode, LocalizedString, VenueApplication } from "@/lib/api";

/**
 * Venue profile of the owner cabinet ("Профиль заведения"): the editable values,
 * what changed against the saved application, field checks and the local copy of
 * unsaved edits.
 */

export const TEXT_LOCALES: LocaleCode[] = ["ru", "en", "ro"];
export const LOCALIZED_FIELDS = ["name", "description", "address"] as const;
export type LocalizedField = (typeof LOCALIZED_FIELDS)[number];

export const DESCRIPTION_MAX = 400;
export const NAME_MAX = 80;
export const AVERAGE_CHECK_MAX = 100_000;
export const MAX_VENUE_PHOTOS = 8;
/** Same box the API checks before moderation (applicationComplete). */
export const MOLDOVA_BOUNDS = { south: 45.45, west: 26.6, north: 48.55, east: 30.2 };

/** Saved values in the API's shape (what a patch compares and sends). */
export type ProfileValues = {
  name: LocalizedString;
  description: LocalizedString;
  address: LocalizedString;
  city_id: string;
  cuisine: string[];
  venue_type: string;
  phone: string;
  email: string;
  website: string;
  hours_text: string;
  lat: number;
  lng: number;
  price_level: number;
  average_check: number;
};

/** What the form edits; numbers stay text while typed. */
export type ProfileDraft = Omit<ProfileValues, "lat" | "lng" | "price_level" | "average_check"> & {
  lat: string;
  lng: string;
  price_level: string;
  average_check: string;
};

export type ProfileField = Exclude<keyof ProfileValues, "lat" | "lng"> | "point";

/** One changed field (a localized field changes per language). */
export type ProfileChange = { field: ProfileField; locale?: LocaleCode };

const text = (value: LocalizedString | string | null | undefined): LocalizedString =>
  typeof value === "string"
    ? { ru: value, en: value, ro: value }
    : { ru: value?.ru ?? "", en: value?.en ?? "", ro: value?.ro ?? "" };

const trimText = (value: LocalizedString): LocalizedString => ({
  ru: value.ru.trim(),
  en: value.en.trim(),
  ro: value.ro.trim(),
});

export const hasText = (value: LocalizedString) => TEXT_LOCALES.some((locale) => value[locale].trim() !== "");

/** Trims, formats the phone and the website and rounds the point, so saved and typed values compare equal. */
export function canonicalValues(values: ProfileValues): ProfileValues {
  const round = (value: number) => (Number.isFinite(value) ? Number(value.toFixed(6)) : 0);
  return {
    name: trimText(values.name),
    description: trimText(values.description),
    address: trimText(values.address),
    city_id: values.city_id || "city-balti",
    cuisine: values.cuisine.map((item) => item.trim()).filter(Boolean),
    venue_type: values.venue_type ?? "",
    phone: formatMoldovaPhone(values.phone ?? ""),
    email: (values.email ?? "").trim(),
    website: normalizeWebsite(values.website ?? "") ?? (values.website ?? "").trim(),
    hours_text: (values.hours_text ?? "").trim(),
    lat: round(values.lat || 0),
    lng: round(values.lng || 0),
    price_level: values.price_level || 0,
    average_check: values.average_check || 0,
  };
}

export function valuesFromApplication(app: VenueApplication): ProfileValues {
  return canonicalValues({
    name: text(app.name),
    description: text(app.description),
    address: text(app.address),
    city_id: app.city_id,
    cuisine: [...(app.cuisine ?? [])],
    venue_type: app.venue_type ?? "",
    phone: app.phone ?? "",
    email: app.email ?? "",
    website: app.website ?? "",
    hours_text: app.hours_text ?? "",
    lat: app.lat,
    lng: app.lng,
    price_level: app.price_level,
    average_check: app.average_check,
  });
}

const coordinateText = (value: number) => (value ? String(value) : "");

export function draftFromValues(values: ProfileValues): ProfileDraft {
  return {
    ...values,
    name: { ...values.name },
    description: { ...values.description },
    address: { ...values.address },
    cuisine: [...values.cuisine],
    lat: coordinateText(values.lat),
    lng: coordinateText(values.lng),
    price_level: values.price_level ? String(values.price_level) : "",
    average_check: values.average_check ? String(values.average_check) : "",
  };
}

export const draftFromApplication = (app: VenueApplication) => draftFromValues(valuesFromApplication(app));

/** "47,7612" → 47.7612; "" or junk → NaN. */
export function parseDecimal(value: string): number {
  const cleaned = value.trim().replace(",", ".");
  return cleaned ? Number(cleaned) : Number.NaN;
}

/** Values the draft would save, cleaned the same way the fields are on blur. */
export function valuesFromDraft(draft: ProfileDraft): ProfileValues {
  const check = Number(draft.average_check.trim());
  return canonicalValues({
    ...draft,
    lat: parseDecimal(draft.lat),
    lng: parseDecimal(draft.lng),
    price_level: Number(draft.price_level) || 0,
    average_check: Number.isInteger(check) && check > 0 ? check : 0,
  });
}

/** The values after the API applies `patch` (its applyPatch). */
export function applyPatch(values: ProfileValues, patch: ApplicationUpdate): ProfileValues {
  const next = { ...values };
  if (patch.name) next.name = text(patch.name);
  if (patch.description) next.description = text(patch.description);
  if (patch.address) next.address = text(patch.address);
  if (patch.cuisine) next.cuisine = [...patch.cuisine];
  if (patch.venue_type !== undefined) next.venue_type = patch.venue_type;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.website !== undefined) next.website = patch.website;
  if (patch.city_id) next.city_id = patch.city_id;
  if (patch.lat !== undefined) next.lat = patch.lat;
  if (patch.lng !== undefined) next.lng = patch.lng;
  if (patch.price_level !== undefined) next.price_level = patch.price_level;
  if (patch.average_check !== undefined) next.average_check = patch.average_check;
  if (patch.hours_text !== undefined) next.hours_text = patch.hours_text;
  return canonicalValues(next);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);
const SCALAR_FIELDS = [
  "venue_type",
  "cuisine",
  "hours_text",
  "city_id",
  "phone",
  "email",
  "website",
  "price_level",
  "average_check",
] as const;

/** Changed fields in the form's order. */
export function diffValues(before: ProfileValues, after: ProfileValues): ProfileChange[] {
  const changes: ProfileChange[] = [];
  const localized = (field: LocalizedField) => {
    for (const locale of TEXT_LOCALES) {
      if (before[field][locale] !== after[field][locale]) changes.push({ field, locale });
    }
  };
  localized("name");
  localized("description");
  for (const field of SCALAR_FIELDS) {
    if (field === "city_id") {
      if (before.city_id !== after.city_id) changes.push({ field });
      localized("address");
      if (before.lat !== after.lat || before.lng !== after.lng) changes.push({ field: "point" });
      continue;
    }
    const same = field === "cuisine" ? sameList(before.cuisine, after.cuisine) : before[field] === after[field];
    if (!same) changes.push({ field });
  }
  return changes;
}

/** Only what changed; a localized field is sent whole so other languages are kept. */
export function patchBetween(before: ProfileValues, after: ProfileValues): ApplicationUpdate {
  const patch: ApplicationUpdate = {};
  for (const change of diffValues(before, after)) {
    switch (change.field) {
      case "name":
      case "description":
      case "address":
        patch[change.field] = { ...after[change.field] };
        break;
      case "point":
        patch.lat = after.lat;
        patch.lng = after.lng;
        break;
      case "cuisine":
        patch.cuisine = [...after.cuisine];
        break;
      case "city_id":
      case "venue_type":
      case "phone":
      case "email":
      case "website":
      case "hours_text":
        patch[change.field] = after[change.field];
        break;
      case "price_level":
      case "average_check":
        patch[change.field] = after[change.field];
        break;
    }
  }
  return patch;
}

/** Fields a change request touches (its patch keys), in the form's order. */
export function patchFields(patch: ApplicationUpdate): ProfileField[] {
  const order: [ProfileField, boolean][] = [
    ["name", Boolean(patch.name)],
    ["description", Boolean(patch.description)],
    ["venue_type", patch.venue_type !== undefined],
    ["cuisine", Boolean(patch.cuisine)],
    ["hours_text", patch.hours_text !== undefined],
    ["city_id", Boolean(patch.city_id)],
    ["address", Boolean(patch.address)],
    ["point", patch.lat !== undefined || patch.lng !== undefined],
    ["phone", patch.phone !== undefined],
    ["email", patch.email !== undefined],
    ["website", patch.website !== undefined],
    ["price_level", patch.price_level !== undefined],
    ["average_check", patch.average_check !== undefined],
  ];
  return order.filter(([, touched]) => touched).map(([field]) => field);
}

export const draftChanges = (app: VenueApplication, draft: ProfileDraft) =>
  diffValues(valuesFromApplication(app), valuesFromDraft(draft));

export const isDraftDirty = (app: VenueApplication, draft: ProfileDraft) => draftChanges(app, draft).length > 0;

/* —— Phone, website, email —— */

/**
 * A Moldovan number in any common spelling ("069 987 654", "+373 69987654", "37369987654",
 * "0231 2 34 56") → "+373XXXXXXXX"; null when it is not one.
 */
export function normalizeMoldovaPhone(input: string): string | null {
  const raw = input.trim();
  if (!raw || /[^\d\s()+.-]/.test(raw) || raw.indexOf("+") > 0) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (!digits.startsWith("373")) return null;
    digits = digits.slice(3);
  } else if (digits.startsWith("00373")) digits = digits.slice(5);
  else if (digits.startsWith("373") && digits.length === 11) digits = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 9) digits = digits.slice(1);
  if (!/^[2-9]\d{7}$/.test(digits)) return null;
  return `+373${digits}`;
}

/** "+37369987654" → "+373 69 987 654"; "+37323123456" → "+373 231 23 456". */
export function formatMoldovaPhone(phone: string): string {
  const normalized = normalizeMoldovaPhone(phone);
  if (!normalized) return phone.trim();
  const national = normalized.slice(4);
  if (/^[67]/.test(national) || national.startsWith("22")) {
    return `+373 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
  }
  return `+373 ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5)}`;
}

/** "restaurant.md" → "https://restaurant.md"; null when it is not a web address. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  if (/\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname;
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
    if (!/^[a-z\d.-]+$/i.test(host) && !/^xn--/i.test(host)) return null;
    if (!/[a-z]{2,}$/i.test(host)) return null;
    return url.pathname === "/" && !url.search && !url.hash && !/\/$/.test(raw) ? url.origin : url.href;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:".]{2,}$/;
export const validEmail = (email: string) => EMAIL_RE.test(email.trim());

export function pointInMoldova(lat: number, lng: number): boolean {
  return (
    lat >= MOLDOVA_BOUNDS.south && lat <= MOLDOVA_BOUNDS.north && lng >= MOLDOVA_BOUNDS.west && lng <= MOLDOVA_BOUNDS.east
  );
}

/* —— Checks —— */

export type FieldKey =
  | "name"
  | "description"
  | "address"
  | "cuisine"
  | "hours"
  | "point"
  | "phone"
  | "email"
  | "website"
  | "average_check"
  | "photos";

export type FieldError = "required" | "invalid" | "outside" | "too_long";
export type FieldErrors = Partial<Record<FieldKey, FieldError>>;

/** Wrong formats only (empty fields are fine for a draft). */
export function formatErrors(draft: ProfileDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.phone.trim() && !normalizeMoldovaPhone(draft.phone)) errors.phone = "invalid";
  if (draft.email.trim() && !validEmail(draft.email)) errors.email = "invalid";
  if (draft.website.trim() && normalizeWebsite(draft.website) === null) errors.website = "invalid";
  const check = draft.average_check.trim();
  if (check && (!/^\d+$/.test(check) || Number(check) > AVERAGE_CHECK_MAX)) errors.average_check = "invalid";
  if (TEXT_LOCALES.some((locale) => draft.description[locale].length > DESCRIPTION_MAX)) errors.description = "too_long";
  if (TEXT_LOCALES.some((locale) => draft.name[locale].length > NAME_MAX)) errors.name = "too_long";
  const lat = draft.lat.trim();
  const lng = draft.lng.trim();
  if (lat || lng) {
    const latitude = parseDecimal(draft.lat);
    const longitude = parseDecimal(draft.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) errors.point = "invalid";
    else if (!pointInMoldova(latitude, longitude)) errors.point = "outside";
  }
  return errors;
}

/** Everything the API needs before moderation, plus wrong formats; photos counted from the saved application. */
export function completenessErrors(draft: ProfileDraft, photoCount: number): FieldErrors {
  const errors: FieldErrors = { ...formatErrors(draft) };
  const values = valuesFromDraft(draft);
  if (!hasText(values.name)) errors.name ??= "required";
  if (!hasText(values.description)) errors.description ??= "required";
  if (!hasText(values.address)) errors.address ??= "required";
  if (!values.cuisine.length) errors.cuisine = "required";
  if (!values.hours_text) errors.hours = "required";
  if (!draft.lat.trim() && !draft.lng.trim()) errors.point = "required";
  if (!values.phone) errors.phone ??= "required";
  if (!values.email) errors.email ??= "required";
  if (photoCount < 1) errors.photos = "required";
  return errors;
}

export type ReadinessKey = "basics" | "address" | "point" | "cuisine" | "contacts" | "hours" | "photos";
export const READINESS_KEYS: ReadinessKey[] = ["basics", "address", "point", "cuisine", "contacts", "hours", "photos"];

/** The seven readiness items of the cabinet, by the same rules the API uses (applicationComplete). */
export function readiness(values: ProfileValues, photoCount: number): Record<ReadinessKey, boolean> {
  return {
    basics: hasText(values.name) && hasText(values.description),
    address: hasText(values.address),
    point: pointInMoldova(values.lat, values.lng),
    cuisine: values.cuisine.length > 0,
    contacts: values.phone.trim() !== "" && validEmail(values.email),
    hours: values.hours_text.trim() !== "",
    photos: photoCount > 0,
  };
}

/** Which readiness item a field error belongs to (to list what is missing). */
export const FIELD_READINESS: Record<FieldKey, ReadinessKey> = {
  name: "basics",
  description: "basics",
  address: "address",
  point: "point",
  cuisine: "cuisine",
  phone: "contacts",
  email: "contacts",
  website: "contacts",
  average_check: "contacts",
  hours: "hours",
  photos: "photos",
};

/* —— Local copy of unsaved edits —— */

const STORE_PREFIX = "seatiko:venue-profile:v2:";
const LEGACY_DRAFT_PREFIX = "seatiko:restaurant-draft:";
const LEGACY_PENDING_PREFIX = "seatiko_venue_pending_changes:";

export type StoredEdits = {
  draft: ProfileDraft;
  /** "draft" = edits of an unpublished application, "change" = a change request being prepared. */
  mode: "draft" | "change";
  /** When the edits were last touched (ms). */
  saved_at: number;
  /** The old cabinet kept "sent to moderation" edits only in this browser; they never reached the API. */
  legacy_unsent?: boolean;
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isDraftShape(value: unknown): value is ProfileDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    LOCALIZED_FIELDS.every((field) => draft[field] && typeof draft[field] === "object") &&
    Array.isArray(draft.cuisine) &&
    typeof draft.phone === "string"
  );
}

type LegacyDraft = Partial<Record<
  "name" | "description" | "address" | "city_id" | "cuisine" | "venue_type" | "phone" | "hours_text" | "email" | "website" | "lat" | "lng" | "price_level" | "average_check",
  string
>>;

/** The old cabinet stored one-language strings; put them over the saved values in the viewer's language. */
export function draftFromLegacy(app: VenueApplication, legacy: LegacyDraft, locale: LocaleCode): ProfileDraft {
  const draft = draftFromApplication(app);
  for (const field of LOCALIZED_FIELDS) {
    const value = legacy[field];
    const shown = app[field]?.[locale] || app[field]?.ru || "";
    if (typeof value === "string" && value.trim() !== shown.trim()) draft[field] = { ...draft[field], [locale]: value };
  }
  if (typeof legacy.cuisine === "string") {
    const list = legacy.cuisine.split(",").map((item) => item.trim()).filter(Boolean);
    if (list.join(", ") !== draft.cuisine.join(", ")) draft.cuisine = list;
  }
  for (const key of ["city_id", "venue_type", "phone", "hours_text", "email", "website", "price_level", "average_check"] as const) {
    if (typeof legacy[key] === "string") draft[key] = legacy[key]!;
  }
  if (typeof legacy.lat === "string" && typeof legacy.lng === "string") {
    const lat = parseDecimal(legacy.lat);
    const lng = parseDecimal(legacy.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== app.lat || lng !== app.lng)) {
      draft.lat = legacy.lat;
      draft.lng = legacy.lng;
    }
  }
  return draft;
}

function readLegacy(store: Storage, app: VenueApplication, locale: LocaleCode): StoredEdits | null {
  const keys = [LEGACY_PENDING_PREFIX + app.id, LEGACY_DRAFT_PREFIX + app.id];
  let found: StoredEdits | null = null;
  for (const key of keys) {
    const raw = store.getItem(key);
    if (!raw || found) continue;
    try {
      const draft = draftFromLegacy(app, JSON.parse(raw) as LegacyDraft, locale);
      if (isDraftDirty(app, draft)) {
        const published = app.status === "PUBLISHED";
        found = {
          draft,
          mode: published ? "change" : "draft",
          saved_at: Date.now(),
          legacy_unsent: published && key.startsWith(LEGACY_PENDING_PREFIX),
        };
      }
    } catch {
      /* unreadable old copy: drop it */
    }
  }
  for (const key of keys) store.removeItem(key);
  return found;
}

/** Unsaved edits of this application, if they still differ from what is saved. Old-format copies are converted once. */
export function readStoredEdits(app: VenueApplication, locale: LocaleCode): StoredEdits | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORE_PREFIX + app.id);
    let edits: StoredEdits | null = null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoredEdits;
      if (parsed && isDraftShape(parsed.draft) && (parsed.mode === "draft" || parsed.mode === "change")) edits = parsed;
    }
    const legacy = readLegacy(store, app, locale);
    if (!edits && legacy) {
      edits = legacy;
      store.setItem(STORE_PREFIX + app.id, JSON.stringify(edits));
    }
    if (!edits) return null;
    const editable = app.status === "DRAFT" || app.status === "REJECTED";
    const fits = edits.mode === "draft" ? editable : app.status === "PUBLISHED";
    if (!fits || !isDraftDirty(app, edits.draft)) {
      store.removeItem(STORE_PREFIX + app.id);
      return null;
    }
    return edits;
  } catch {
    return null;
  }
}

export function writeStoredEdits(applicationId: string, edits: StoredEdits) {
  try {
    storage()?.setItem(STORE_PREFIX + applicationId, JSON.stringify(edits));
  } catch {
    /* storage full or blocked: edits stay in memory only */
  }
}

export function clearStoredEdits(applicationId: string) {
  try {
    const store = storage();
    store?.removeItem(STORE_PREFIX + applicationId);
    store?.removeItem(LEGACY_DRAFT_PREFIX + applicationId);
    store?.removeItem(LEGACY_PENDING_PREFIX + applicationId);
  } catch {
    /* nothing to clear */
  }
}

/** For the sidebar: does this venue have edits that are neither saved nor sent? */
export function hasStoredEdits(app: VenueApplication, locale: LocaleCode): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const raw = store.getItem(STORE_PREFIX + app.id);
    if (raw) {
      const edits = JSON.parse(raw) as StoredEdits;
      return isDraftShape(edits.draft) && isDraftDirty(app, edits.draft);
    }
    // An old-format copy is converted when the profile opens; until then it still counts.
    return [LEGACY_PENDING_PREFIX, LEGACY_DRAFT_PREFIX].some((prefix) => {
      const legacy = store.getItem(prefix + app.id);
      return legacy ? isDraftDirty(app, draftFromLegacy(app, JSON.parse(legacy) as LegacyDraft, locale)) : false;
    });
  } catch {
    return false;
  }
}

/** What guests see for a language that is left empty (the API's pickLocale order). */
export function guestFallbackLocale(value: LocalizedString, locale: LocaleCode): LocaleCode | null {
  if (value[locale].trim()) return locale;
  if (value.en.trim()) return "en";
  if (value.ru.trim()) return "ru";
  if (value.ro.trim()) return "ro";
  return null;
}
