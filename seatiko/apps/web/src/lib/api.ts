import { AUTH_CHANGE_EVENT, PROFILE_CHANGE_EVENT } from "@/lib/header-auth";

// Empty string → same origin through nginx (:80) → /api/v1/...
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const TOKEN_KEY = "fa_token";

export type LocaleCode = "ru" | "en" | "ro";
export type UserRole = "guest" | "restaurant" | "staff" | "admin";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED";

export type LocalizedString = { ru: string; en: string; ro: string };

export type City = {
  id: string;
  slug: string;
  name: LocalizedString;
  available: boolean;
  country: string;
  center?: MapCoordinates;
  bounds?: MapBounds;
};

export type MapCoordinates = { lat: number; lng: number };
export type MapBounds = { south: number; west: number; north: number; east: number };
export type MapConfig = {
  cities: City[];
  country_bounds: MapBounds;
  google_maps_key: string;
  google_maps_id: string;
};

export type Venue = {
  id: string;
  city_id: string;
  name: LocalizedString;
  description: LocalizedString;
  cuisine: string[];
  rating: number;
  review_count?: number;
  price_level: number;
  address: LocalizedString;
  lat: number;
  lng: number;
  average_check: number;
  open_now: boolean;
  free_tables: number;
  image_url: string;
  photo_urls?: string[];
  website?: string;
  google_place_id?: string;
  reviews?: VenueReview[];
  alcohol_license_valid?: boolean;
  session_start_before_min?: number;
  release_before_min?: number;
  booking_interval_min?: number;
  visit_duration_min?: number;
  max_visit_duration_min?: number;
  hold_minutes?: number;
  max_late_arrival_min?: number;
  allow_preorder?: boolean;
};

export type VenueReview = {
  author: string;
  rating: number;
  text: string;
  relative_time?: string;
  source?: string;
  profile_url?: string;
};

export type VenuePlaces = {
  source: string;
  google_place_id?: string;
  rating: number;
  review_count: number;
  photo_urls: string[];
  reviews: VenueReview[];
  live_google: boolean;
};

export type MapPlace = {
  id: string;
  name: LocalizedString;
  lat: number;
  lng: number;
  address: LocalizedString;
  rating?: number;
  google_place_id?: string;
  in_database: boolean;
  bookable: boolean;
  venue_id?: string;
  free_tables?: number;
  open_now?: boolean | null;
  cuisine?: string[];
  price_level?: number;
  average_check?: number;
  website?: string;
  /** Open-data places (not partners yet): phone, OSM opening_hours, kind and datasets. */
  phone?: string;
  opening_hours?: string;
  category?: string;
  sources?: string[];
};

export type MapPlacesResponse = {
  city_id: string;
  country: string;
  center: MapCoordinates;
  bounds: MapBounds;
  places: MapPlace[];
  source: {
    google_enabled: boolean;
    google_status: "ready" | "disabled" | "unavailable" | "not_requested";
    google_count: number;
    database_count: number;
    /** Places from OpenStreetMap / Overture (Nest API). */
    open_data_count?: number;
    open_data_updated_at?: string | null;
    attribution?: string;
  };
  /** Set when /discover filters are sent: places in the area, matches, and which filter to loosen at 0. */
  filters?: {
    total: number;
    matched: number;
    relax?: { filter: string; matched: number };
  };
};

export type TableStatus = "FREE" | "RESERVED" | "OCCUPIED" | "CLEANING";

export type Table = {
  id: string;
  venue_id: string;
  number: number;
  seats: number;
  status: TableStatus;
  occupied_since?: string | null;
  reserved_for?: string | null;
  reservation_id?: string | null;
  x: number;
  y: number;
  zone?: string;
  qr_token?: string;
};

export type User = {
  id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  locale: string;
  role?: UserRole | string;
  diet_preferences?: string[];
  favorite_venues?: string[];
  /** Profile photo (POST /me/avatar), absolute or `/media/...`; load it through `mediaUrl`. */
  avatar_url?: string;
  deleted_at?: string;
  /** Read-only: staff confirmed 18+ in person (APP_LOGIC §8.4). */
  adult_preorder_allowed?: boolean;
  adult_verification?: AdultVerification;
  /** false for an account created with Google until it sets a password. */
  has_password?: boolean;
  created_at: string;
};

/** Sign-in options of the server (GET /auth/providers). */
export type AuthProviders = { google: { enabled: boolean; client_id: string } };
/** A Google account connected to the user (GET /me/identities). */
export type ConnectedIdentity = { provider: "google"; email: string; created_at: string };

/** Who confirmed the guest is 18+, where and when (shown read-only in the account). */
export type AdultVerification = {
  verified_at: string;
  verified_by_staff_id: string;
  verified_by_staff_role: "waiter" | "manager" | "admin" | string;
  verified_by_staff_display_name: string;
  verified_at_venue_id: string;
  id_document_checked: boolean;
  id_document_type: "id_card" | "passport" | "other" | string;
  revoked_at?: string;
  revoked_by_staff_id?: string;
};

export type AuthResponse = { token: string; user: User };

export type VenueApplication = {
  id: string;
  owner_user_id: string;
  status: ApplicationStatus;
  name: LocalizedString;
  description: LocalizedString;
  address: LocalizedString;
  cuisine: string[];
  /** Venue format (RestaurantTypeId); "" or missing = not chosen yet. */
  venue_type?: string;
  phone: string;
  email: string;
  website?: string;
  city_id: string;
  lat: number;
  lng: number;
  price_level: number;
  average_check: number;
  photo_urls: string[];
  hours_text: string;
  reject_reason?: string;
  venue_id?: string | null;
  booking_interval_min?: number;
  hold_minutes?: number;
  allow_preorder?: boolean;
  session_start_before_min?: number;
  release_before_min?: number;
  max_late_arrival_min?: number;
  visit_duration_min?: number;
  max_visit_duration_min?: number;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
};

export type ApplicationActivity = {
  id: string;
  application_id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  /** null when nothing was listed (the API never sends an empty array). */
  changed_fields: string[] | null;
  note?: string;
  created_at: string;
};

export type ApplicationUpdate = {
  name?: LocalizedString;
  description?: LocalizedString;
  address?: LocalizedString;
  cuisine?: string[];
  venue_type?: string;
  phone?: string;
  email?: string;
  website?: string;
  city_id?: string;
  lat?: number;
  lng?: number;
  price_level?: number;
  average_check?: number;
  hours_text?: string;
};

export type Reservation = {
  id: string;
  user_id: string;
  venue_id: string;
  table_id: string;
  table_ids?: string[];
  table_numbers?: number[];
  guests: number;
  reserved_for: string;
  duration_min?: number;
  status: string;
  notes?: string;
  source?: "WEB" | "ANDROID" | "IOS" | "PHONE" | "WALK_IN";
  arrival_confirmed_at?: string | null;
  expected_arrival?: string | null;
  created_at: string;
  /** Active preorder of this reservation, if any. */
  preorder?: Order;
  venue_name?: LocalizedString;
  table_number?: number;
};

export type EventInquiry = {
  id: string;
  user_id: string;
  venue_id: string;
  venue_name?: LocalizedString;
  event_type: "birthday" | "banquet" | "corporate" | "romantic" | "other" | string;
  guest_count: number;
  preferred_date: string;
  contact_method: "chat" | "call" | string;
  contact_phone: string;
  contact_name: string;
  notes?: string;
  status: string;
  admin_phone?: string;
  admin_telegram?: string;
  created_at: string;
  updated_at?: string;
};

export type RestaurantReservation = {
  id: string;
  venue_id: string;
  venue_name: LocalizedString;
  table_id: string;
  table_number: number;
  guest_name: string;
  guest_email: string;
  guests: number;
  reserved_for: string;
  status: string;
  arrival_confirmed_at?: string | null;
  created_at: string;
  /** Active preorder of this booking, if any. */
  preorder?: Order;
};

export type Session = {
  id: string;
  user_id: string;
  venue_id: string;
  table_id: string;
  reservation_id?: string | null;
  status: string;
  started_at: string;
  closed_at?: string | null;
};

export type MenuItem = {
  id: string;
  venue_id: string;
  category: LocalizedString;
  name: LocalizedString;
  description: LocalizedString;
  /** Full composition for the dish popup. */
  ingredients?: LocalizedString;
  /** Allergen codes: gluten, milk, eggs, fish, … — localised in the UI. */
  allergens?: string[];
  price: number;
  /** Portion in grams (food). */
  weight_g?: number;
  /** Portion in millilitres (drinks). */
  volume_ml?: number;
  /** Dish photo (absolute URL or path under the API). */
  image_url?: string;
  contains_alcohol: boolean;
  /** 18+ item: preorder needs `adult_preorder_allowed`; always true for alcohol. */
  requires_age_18?: boolean;
  /** `popular` | `vegetarian` | `spicy`. */
  tags?: string[];
  position?: number;
  stopped?: boolean;
};

export type OrderItem = {
  menu_item_id: string;
  name: LocalizedString;
  qty: number;
  /** Per unit, fixed when ordered. */
  price: number;
  requires_age_18?: boolean;
  contains_alcohol?: boolean;
  /** 18+ items of a preorder: staff check an ID in person before serving. */
  age_check?: "PENDING_AGE_CHECK" | "CONFIRMED";
  /** The dish was deleted or stopped after ordering. */
  unavailable?: boolean;
};

export type Order = {
  id: string;
  session_id: string;
  user_id: string;
  venue_id: string;
  items: OrderItem[];
  status: string;
  total: number;
  created_at: string;
  updated_at: string;
  check_number?: string;
  payment_method?: string;
  paid_at?: string | null;
  venue_name?: LocalizedString;
  /** Dishes ordered ahead for a reservation (`PUT /reservations/:id/preorder`). */
  preorder?: boolean;
  reservation_id?: string;
  /** Kitchen starts at this time; the guest can change or cancel until then. */
  kitchen_at?: string;
  kitchen_due?: boolean;
  adult_items_removed_at?: string;
};

export type HolidayCollection = {
  id: string;
  slug: string;
  title: LocalizedString;
  venue_ids: string[];
};

export type WaitlistStatus =
  | "WAITING"
  | "READY"
  | "SEATED"
  | "LEFT"
  | "EXPIRED";

export type WaitlistEntry = {
  id: string;
  venue_id: string;
  user_id?: string;
  guest_name: string;
  phone?: string;
  guests: number;
  zone?: string;
  note?: string;
  status: WaitlistStatus;
  source: string;
  table_id?: string;
  created_at: string;
  notified_at?: string | null;
  seated_at?: string | null;
  closed_at?: string | null;
  position?: number;
  quoted_wait_min?: number;
  table_number?: number;
  venue_name?: LocalizedString;
};

export type WaitlistSummary = {
  venue_id: string;
  waiting: number;
  quoted_wait_min: number;
  free_tables: number;
};

export type DiscoverAiPrefs = {
  cuisine: string[];
  restaurant_type: string[];
  budget?: { min: number; max: number } | null;
  occasion: string[];
  practical: string[];
};

export type DiscoverResult = {
  /** Ranked venues (same order as `ranked`). */
  venues: Venue[];
  ranked?: { venue_id: string; score: number; reasons: string[] }[];
  prefs?: DiscoverAiPrefs;
  /** Ready for `/?${query_string}#map`. */
  query_string?: string;
  /** false when nothing passes the filters and the ranking is approximate. */
  exact?: boolean;
  source?: "groq" | "rules";
  explanation?: LocalizedString | string;
};

export type QrSessionResponse = {
  session: Session;
  venue?: Venue;
  table?: Table;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function pickLocale(
  s: LocalizedString | string | undefined | null,
  locale: LocaleCode,
): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return s[locale] || s.en || s.ru || "";
}

/** Prefix relative upload URLs with API origin when needed. */
export function mediaUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export function emptyLocalized(ru = ""): LocalizedString {
  return { ru, en: ru, ro: ru };
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
};

async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    signal: opts.signal,
  });

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) code = err.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchCities(): Promise<City[]> {
  const data = await apiFetch<{ cities: City[] }>("/api/v1/cities", {
    auth: false,
  });
  return data.cities ?? [];
}

export async function fetchVenues(cityId = "city-balti"): Promise<Venue[]> {
  const data = await apiFetch<{ venues: Venue[] }>("/api/v1/venues", {
    auth: false,
    query: { city_id: cityId },
  });
  return data.venues ?? [];
}

export async function fetchMapPlaces(
  cityId: string,
  options: {
    includeGoogle: boolean;
    locale: LocaleCode;
    bounds?: MapBounds;
    query?: string;
    bookableOnly?: boolean;
    /** Encoded /discover preferences (encodePreferences) for server-side match counts. */
    filters?: string;
    /** Guest position for the "nearby" filter. */
    near?: { lat: number; lng: number } | null;
    signal?: AbortSignal;
  },
): Promise<MapPlacesResponse> {
  const { bounds, includeGoogle, locale, query, bookableOnly, filters, near, signal } = options;
  return apiFetch<MapPlacesResponse>("/api/v1/map/places", {
    auth: false,
    signal,
    query: {
      city_id: cityId,
      lang: locale,
      include_google: String(includeGoogle),
      bounds: bounds && [bounds.south, bounds.west, bounds.north, bounds.east].join(","),
      q: query?.trim(),
      bookable_only: bookableOnly ? "true" : undefined,
      ...(filters ? Object.fromEntries(new URLSearchParams(filters)) : {}),
      lat: near ? near.lat : undefined,
      lng: near ? near.lng : undefined,
    },
  });
}

export function fetchMapConfig(): Promise<MapConfig> {
  return apiFetch<MapConfig>("/api/v1/map/config", { auth: false });
}

export async function fetchVenue(id: string): Promise<Venue> {
  const data = await apiFetch<{ venue: Venue }>(`/api/v1/venues/${id}`, {
    auth: false,
  });
  return data.venue;
}

export async function fetchVenuePlaces(id: string): Promise<VenuePlaces> {
  return apiFetch<VenuePlaces>(`/api/v1/venues/${id}/places`, { auth: false });
}

export async function fetchTables(venueId: string): Promise<Table[]> {
  const data = await apiFetch<{ tables: Table[] }>(
    `/api/v1/venues/${venueId}/tables`,
    { auth: false },
  );
  return data.tables ?? [];
}

export type VenueScheduleSlot = {
  id: string;
  table_id: string;
  table_number: number;
  starts_at: string;
  ends_at: string;
  kind: "RESERVATION" | "OCCUPIED" | string;
};

export async function fetchVenueSchedule(
  venueId: string,
): Promise<VenueScheduleSlot[]> {
  const data = await apiFetch<{ slots: VenueScheduleSlot[] }>(
    `/api/v1/venues/${venueId}/schedule`,
    { auth: false },
  );
  return data.slots ?? [];
}

export type ApiAvailabilitySlot = { starts_at: string; table_id: string; table_number: number };

/** One venue's answer from GET /availability (server-side free table search). */
export type ApiVenueAvailability = {
  venue_id: string;
  duration_min: number;
  fits: boolean;
  exact: boolean;
  slots: ApiAvailabilitySlot[];
  later_today?: ApiAvailabilitySlot[];
};

/** Venues with a free table for `guests` around `at` (or the earliest that `date`), best match first. */
export async function fetchAvailability(
  params: {
    cityId?: string;
    /** Wanted start; omit for "as soon as possible". */
    at?: Date | null;
    /** Local day YYYY-MM-DD, used when `at` is omitted. */
    date?: string;
    guests: number;
    durationMin: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<ApiVenueAvailability[]> {
  const data = await apiFetch<{ venues: ApiVenueAvailability[] }>("/api/v1/availability", {
    auth: false,
    signal,
    query: {
      city_id: params.cityId ?? "city-balti",
      at: params.at ? params.at.toISOString() : undefined,
      date: params.at ? undefined : params.date,
      guests: params.guests,
      duration_min: params.durationMin,
      limit: params.limit,
    },
  });
  return data.venues ?? [];
}

export async function fetchMenu(venueId: string): Promise<MenuItem[]> {
  const data = await apiFetch<{ items?: MenuItem[]; menu?: MenuItem[] }>(
    `/api/v1/venues/${venueId}/menu`,
    { auth: false },
  );
  return data.items ?? data.menu ?? [];
}

export async function fetchCollections(): Promise<HolidayCollection[]> {
  const data = await apiFetch<{ collections: HolidayCollection[] }>(
    "/api/v1/collections",
    { auth: false },
  );
  return data.collections ?? [];
}

export async function discoverAi(input: {
  query: string;
  city_id?: string;
  locale?: string;
  prefs?: DiscoverAiPrefs;
  filters?: string[];
}): Promise<DiscoverResult> {
  return apiFetch<DiscoverResult>("/api/v1/discover/ai", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export async function register(input: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  locale?: string;
  role?: UserRole;
}): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });
  setToken(data.token);
  return data;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
  setToken(data.token);
  return data;
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  return apiFetch<AuthProviders>("/api/v1/auth/providers", { auth: false });
}

/**
 * Sign in or sign up with the ID token from the Google button. 409 link_required: an
 * account with this email exists — sign in with its password, then connect Google.
 */
export async function googleSignIn(input: {
  credential: string;
  /** The nonce of this sign-in's request to Google; the token must carry it. */
  nonce?: string;
  role?: UserRole;
  locale?: string;
}): Promise<AuthResponse & { created: boolean }> {
  const data = await apiFetch<AuthResponse & { created: boolean }>("/api/v1/auth/google", {
    method: "POST",
    body: input,
    auth: false,
  });
  setToken(data.token);
  return data;
}

export async function listIdentities(): Promise<ConnectedIdentity[]> {
  const data = await apiFetch<{ identities: ConnectedIdentity[] }>("/api/v1/me/identities");
  return data.identities ?? [];
}

export async function connectGoogle(input: { credential: string; nonce?: string; password?: string }): Promise<ConnectedIdentity[]> {
  const data = await apiFetch<{ identities: ConnectedIdentity[] }>("/api/v1/me/identities/google", {
    method: "POST",
    body: input,
  });
  return data.identities ?? [];
}

export async function disconnectGoogle(): Promise<ConnectedIdentity[]> {
  const data = await apiFetch<{ identities: ConnectedIdentity[] }>("/api/v1/me/identities/google", {
    method: "DELETE",
  });
  return data.identities ?? [];
}

export function logout() {
  setToken(null);
}

export async function fetchMe(): Promise<User> {
  const data = await apiFetch<{ user: User }>("/api/v1/me");
  return data.user;
}

export async function updateMe(input: {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  locale?: string;
  diet_preferences?: string[];
  favorite_venues?: string[];
}): Promise<User> {
  const data = await apiFetch<{ user: User }>("/api/v1/me", {
    method: "PATCH",
    body: input,
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_CHANGE_EVENT));
  return data.user;
}

export async function updateEmail(email: string): Promise<User> {
  const data = await apiFetch<{ user: User }>("/api/v1/me/email", {
    method: "PATCH",
    body: { email },
  });
  return data.user;
}

export async function updatePassword(input: {
  /** Not needed when an account created with Google sets its first password. */
  old_password?: string;
  new_password: string;
}): Promise<void> {
  await apiFetch<{ status: string }>("/api/v1/me/password", {
    method: "PATCH",
    body: input,
  });
}

export function redirectPathForRole(role?: string | null): string {
  if (role === "admin") return "/admin";
  if (role === "restaurant") return "/cabinet";
  if (role === "staff") return "/staff";
  if (role === "guest") return "/account";
  return "/";
}

/* —— Restaurant applications —— */

export async function listMyApplications(): Promise<VenueApplication[]> {
  const data = await apiFetch<{ applications: VenueApplication[] }>(
    "/api/v1/restaurant/applications",
  );
  return data.applications ?? [];
}

export async function getApplication(id: string): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/restaurant/applications/${id}`,
  );
  return data.application;
}

export async function listApplicationActivity(
  id: string,
): Promise<ApplicationActivity[]> {
  const data = await apiFetch<{ activity: ApplicationActivity[] }>(
    `/api/v1/restaurant/applications/${id}/activity`,
  );
  return data.activity ?? [];
}

export async function listRestaurantReservations(): Promise<
  RestaurantReservation[]
> {
  const data = await apiFetch<{ reservations: RestaurantReservation[] }>(
    "/api/v1/restaurant/reservations",
  );
  return data.reservations ?? [];
}

export async function createApplication(): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    "/api/v1/restaurant/applications",
    { method: "POST", body: {} },
  );
  return data.application;
}

export async function deleteApplication(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/restaurant/applications/${id}`, {
    method: "DELETE",
  });
}

export async function updateApplication(
  id: string,
  input: ApplicationUpdate,
): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/restaurant/applications/${id}`,
    { method: "PATCH", body: input },
  );
  return data.application;
}

export async function submitApplication(id: string): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/restaurant/applications/${id}/submit`,
    { method: "POST", body: {} },
  );
  return data.application;
}

export async function uploadApplicationPhoto(
  id: string,
  file: File,
): Promise<VenueApplication> {
  const url = new URL(
    `${API_URL}/api/v1/restaurant/applications/${id}/photos`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  const form = new FormData();
  form.append("photo", file);

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) code = err.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }

  const data = (await res.json()) as {
    application?: VenueApplication;
    photo_url?: string;
  };
  if (data.application) return data.application;
  return getApplication(id);
}

export async function removeApplicationPhoto(
  id: string,
  photoUrl: string,
): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/restaurant/applications/${id}/photos`,
    { method: "DELETE", body: { url: photoUrl } },
  );
  return data.application;
}

/* —— Admin —— */

export async function adminListApplications(
  status?: ApplicationStatus | "",
): Promise<VenueApplication[]> {
  const data = await apiFetch<{ applications: VenueApplication[] }>(
    "/api/v1/admin/applications",
    { query: status ? { status } : undefined },
  );
  return data.applications ?? [];
}

export async function adminReviewApplication(
  id: string,
  input: {
    status: "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    reject_reason?: string;
  },
): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/admin/applications/${id}/review`,
    { method: "POST", body: input },
  );
  return data.application;
}

export async function adminPublishApplication(
  id: string,
): Promise<VenueApplication> {
  const data = await apiFetch<{ application: VenueApplication }>(
    `/api/v1/admin/applications/${id}/publish`,
    { method: "POST", body: {} },
  );
  return data.application;
}

export async function createReservation(input: {
  venue_id: string;
  table_id: string;
  table_ids?: string[];
  guests: number;
  reserved_for: string;
  /** Guest-chosen booking length; omitted = venue default. */
  duration_min?: number;
  notes?: string;
}): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    "/api/v1/reservations",
    { method: "POST", body: { ...input, source: "WEB" } },
  );
  return data.reservation;
}

export async function updateReservation(
  reservationId: string,
  input: {
    table_id?: string;
    table_ids?: string[];
    guests?: number;
    reserved_for?: string;
    notes?: string;
  },
): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    `/api/v1/reservations/${reservationId}`,
    { method: "PATCH", body: input },
  );
  return data.reservation;
}

export async function createEventInquiry(input: {
  venue_id: string;
  event_type: string;
  guest_count: number;
  preferred_date: string;
  contact_method: string;
  contact_phone: string;
  contact_name: string;
  notes?: string;
}): Promise<EventInquiry> {
  const data = await apiFetch<{ inquiry: EventInquiry }>(
    "/api/v1/event-inquiries",
    { method: "POST", body: input },
  );
  return data.inquiry;
}

export async function listEventInquiries(): Promise<EventInquiry[]> {
  const data = await apiFetch<{ inquiries: EventInquiry[] }>(
    "/api/v1/event-inquiries",
  );
  return data.inquiries ?? [];
}

export async function fetchReservations(): Promise<Reservation[]> {
  const data = await apiFetch<{ reservations: Reservation[] }>(
    "/api/v1/reservations",
  );
  return data.reservations ?? [];
}

export async function openSessionFromQr(token: string): Promise<QrSessionResponse> {
  const normalized = token.trim();
  const separator = normalized.includes(":") ? ":" : normalized.includes("/") ? "/" : null;
  const parts = separator ? normalized.split(separator) : [];
  const venueId = parts[0] || "venue-1";
  const tableId = parts[1] || "t1";
  const qrToken = parts.slice(2).join(separator ?? ":") || "demo";
  return apiFetch<QrSessionResponse>("/api/v1/sessions/qr", {
    method: "POST",
    body: { venue_id: venueId, table_id: tableId, token: qrToken },
  });
}

export async function fetchOrders(): Promise<Order[]> {
  const data = await apiFetch<{ orders: Order[] }>("/api/v1/orders");
  return data.orders ?? [];
}

export async function createOrder(input: {
  session_id: string;
  venue_id: string;
  items: { menu_item_id: string; qty: number }[];
}): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/sessions/${input.session_id}/orders`, {
    method: "POST",
    body: { items: input.items },
  });
  return data.order;
}

export async function callWaiter(input: {
  session_id: string;
  reason: string;
}): Promise<{ id: string; status: string }> {
  const data = await apiFetch<{ waiter_call: { id: string; status: string } }>(`/api/v1/sessions/${input.session_id}/waiter-calls`, {
    method: "POST",
    body: { reason: input.reason },
  });
  return data.waiter_call;
}

export async function closeSession(sessionId: string): Promise<Session> {
  const data = await apiFetch<{ session: Session }>(
    `/api/v1/sessions/${sessionId}/close`,
    { method: "POST", body: {} },
  );
  return data.session;
}

export async function payOrder(input: {
  order_id: string;
  method: "app" | "venue";
}): Promise<{ status: string; order?: Order }> {
  return apiFetch("/api/v1/payments", {
    method: "POST",
    body: input,
  });
}

export async function watchTable(input: {
  venue_id: string;
  table_id: string;
}): Promise<{ id: string }> {
  const data = await apiFetch<{ watch: { id: string } }>(`/api/v1/tables/${input.table_id}/watch`, {
    method: "POST",
    body: { venue_id: input.venue_id },
  });
  return data.watch;
}

export async function confirmArrival(
  reservationId: string,
  input?: { expected_arrival?: string },
): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    `/api/v1/reservations/${reservationId}/confirm-arrival`,
    { method: "POST", body: input ?? {} },
  );
  return data.reservation;
}

export async function cancelReservation(
  reservationId: string,
): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    `/api/v1/reservations/${reservationId}/cancel`,
    { method: "POST" },
  );
  return data.reservation;
}

export async function deleteReservation(
  reservationId: string,
): Promise<void> {
  await apiFetch(`/api/v1/reservations/${reservationId}`, {
    method: "DELETE",
  });
}

export async function clearHistoryReservations(): Promise<{ cleared: number }> {
  return await apiFetch<{ cleared: number }>(`/api/v1/reservations/history`, {
    method: "DELETE",
  });
}

export async function fetchWaitlistSummary(
  venueId: string,
): Promise<WaitlistSummary> {
  const data = await apiFetch<{ summary: WaitlistSummary }>(
    `/api/v1/venues/${venueId}/waitlist/summary`,
    { auth: false },
  );
  return data.summary;
}

export async function joinWaitlist(input: {
  venue_id: string;
  guests: number;
  phone?: string;
  zone?: string;
  note?: string;
  guest_name?: string;
}): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>("/api/v1/waitlist", {
    method: "POST",
    body: { ...input, source: "WEB" },
  });
  return data.entry;
}

export async function fetchMyWaitlist(): Promise<WaitlistEntry[]> {
  const data = await apiFetch<{ waitlist: WaitlistEntry[] }>("/api/v1/waitlist");
  return data.waitlist ?? [];
}

export async function leaveWaitlist(id: string): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>(`/api/v1/waitlist/${id}`, {
    method: "DELETE",
  });
  return data.entry;
}

export async function staffListWaitlist(
  venueId: string,
): Promise<WaitlistEntry[]> {
  const data = await apiFetch<{ waitlist: WaitlistEntry[] }>(
    "/api/v1/staff/waitlist",
    { query: { venue_id: venueId } },
  );
  return data.waitlist ?? [];
}

export async function staffAddWaitlist(input: {
  venue_id: string;
  guest_name: string;
  guests: number;
  phone?: string;
  note?: string;
}): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>("/api/v1/staff/waitlist", {
    method: "POST",
    body: input,
  });
  return data.entry;
}

export async function staffNotifyWaitlist(
  id: string,
  tableId?: string,
): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>(
    `/api/v1/staff/waitlist/${id}/notify`,
    { method: "POST", body: { table_id: tableId ?? "" } },
  );
  return data.entry;
}

export async function staffSeatWaitlist(
  id: string,
  tableId?: string,
): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>(
    `/api/v1/staff/waitlist/${id}/seat`,
    { method: "POST", body: { table_id: tableId ?? "" } },
  );
  return data.entry;
}

export async function staffCloseWaitlist(
  id: string,
  status: "LEFT" | "EXPIRED" = "LEFT",
): Promise<WaitlistEntry> {
  const data = await apiFetch<{ entry: WaitlistEntry }>(
    `/api/v1/staff/waitlist/${id}/close`,
    { method: "POST", body: { status } },
  );
  return data.entry;
}

export function priceLevelLabel(level: number): string {
  return "€".repeat(Math.max(1, Math.min(3, level || 1)));
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export type VenueAnalytics = {
  venue_id: string;
  reservations_by_status: Record<string, number>;
  free_tables: number;
  waiter_calls_pending: number;
  orders_by_status: Record<string, number>;
  total_tables: number;
};

export type StaffMember = {
  id: string;
  venue_id: string;
  user_id?: string;
  name?: string;
  email: string;
  /** Venue role key (see VenueRole.key). */
  role: string;
  status: string;
  on_shift?: boolean;
  created_at: string;
};

export type WorkShift = {
  id: string;
  venue_id: string;
  staff_id: string;
  staff_name: string;
  /** Venue role key (see VenueRole.key). */
  role: string;
  /** Owner's role name; "" = translated preset name of `role`. */
  role_name?: string;
  role_color?: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: "PENDING" | "CONFIRMED" | "DECLINED" | "SWAP_REQUESTED";
  note?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
};

export async function replaceVenueTables(
  venueId: string,
  tables: { number: number; seats: number; x: number; y: number; zone?: string }[],
): Promise<Table[]> {
  const data = await apiFetch<{ tables: Table[] }>(
    `/api/v1/restaurant/venues/${venueId}/tables`,
    { method: "PUT", body: { tables } },
  );
  return data.tables ?? [];
}

export async function listOwnerMenu(venueId: string): Promise<MenuItem[]> {
  const data = await apiFetch<{ items?: MenuItem[]; menu?: MenuItem[] }>(
    `/api/v1/restaurant/venues/${venueId}/menu`,
  );
  return data.menu ?? data.items ?? [];
}

export async function upsertOwnerMenuItem(
  venueId: string,
  item: Partial<MenuItem> & { name: LocalizedString; price: number },
): Promise<MenuItem> {
  const data = await apiFetch<{ item: MenuItem }>(
    `/api/v1/restaurant/venues/${venueId}/menu`,
    { method: "POST", body: item },
  );
  return data.item;
}

export async function updateOwnerMenuItem(
  venueId: string,
  itemId: string,
  item: Partial<MenuItem> & { name: LocalizedString; price: number },
): Promise<MenuItem> {
  const data = await apiFetch<{ item: MenuItem }>(
    `/api/v1/restaurant/venues/${venueId}/menu/${itemId}`,
    { method: "PATCH", body: item },
  );
  return data.item;
}

export async function deleteOwnerMenuItem(
  venueId: string,
  itemId: string,
): Promise<void> {
  await apiFetch(`/api/v1/restaurant/venues/${venueId}/menu/${itemId}`, {
    method: "DELETE",
  });
}

export async function stopOwnerMenuItem(
  venueId: string,
  itemId: string,
  stopped = true,
): Promise<MenuItem> {
  const data = await apiFetch<{ item: MenuItem }>(
    `/api/v1/restaurant/venues/${venueId}/menu/${itemId}/stop`,
    { method: "POST", body: { stopped } },
  );
  return data.item;
}

export async function listVenueQR(venueId: string): Promise<Table[]> {
  const data = await apiFetch<{ tables: Table[] }>(
    `/api/v1/restaurant/venues/${venueId}/qr`,
  );
  return data.tables ?? [];
}

export async function regenerateVenueQR(venueId: string): Promise<Table[]> {
  const data = await apiFetch<{ tables: Table[] }>(
    `/api/v1/restaurant/venues/${venueId}/qr/regenerate`,
    { method: "POST", body: {} },
  );
  return data.tables ?? [];
}

export async function updateBookingRules(
  venueId: string,
  rules: Partial<Pick<
    Venue,
    | "booking_interval_min"
    | "visit_duration_min"
    | "max_visit_duration_min"
    | "hold_minutes"
    | "max_late_arrival_min"
    | "session_start_before_min"
    | "release_before_min"
    | "allow_preorder"
  >>,
): Promise<Venue> {
  const data = await apiFetch<{ venue: Venue }>(
    `/api/v1/restaurant/venues/${venueId}/booking-rules`,
    { method: "PATCH", body: rules },
  );
  return data.venue;
}

export async function fetchVenueAnalytics(
  venueId: string,
): Promise<VenueAnalytics> {
  const data = await apiFetch<{ analytics: VenueAnalytics }>(
    `/api/v1/restaurant/venues/${venueId}/analytics`,
  );
  return data.analytics;
}

export async function inviteVenueStaff(
  venueId: string,
  email: string,
  name?: string,
  role?: string,
): Promise<StaffMember> {
  const data = await apiFetch<{ staff: StaffMember }>(
    `/api/v1/restaurant/venues/${venueId}/staff/invite`,
    { method: "POST", body: { email, name, role } },
  );
  return data.staff;
}

export async function listVenueWorkShifts(
  venueId: string,
  role?: string,
): Promise<WorkShift[]> {
  const data = await apiFetch<{ shifts: WorkShift[] }>(
    `/api/v1/restaurant/venues/${venueId}/shifts`,
    { query: role ? { role } : undefined },
  );
  return data.shifts ?? [];
}

export async function createVenueWorkShift(
  venueId: string,
  input: {
    staff_id: string;
    date: string;
    start_time: string;
    end_time: string;
    note?: string;
  },
): Promise<WorkShift> {
  const data = await apiFetch<{ shift: WorkShift }>(
    `/api/v1/restaurant/venues/${venueId}/shifts`,
    { method: "POST", body: input },
  );
  return data.shift;
}

export async function deleteVenueWorkShift(
  venueId: string,
  shiftId: string,
): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `/api/v1/restaurant/venues/${venueId}/shifts/${shiftId}`,
    { method: "DELETE" },
  );
}

export async function batchCreateVenueWorkShifts(
  venueId: string,
  input: {
    staff_ids: string[];
    dates: string[];
    start_time: string;
    end_time: string;
    note?: string;
  },
): Promise<WorkShift[]> {
  const data = await apiFetch<{ shifts: WorkShift[] }>(
    `/api/v1/restaurant/venues/${venueId}/shifts/batch`,
    { method: "POST", body: input },
  );
  return data.shifts ?? [];
}

export async function copyVenueWorkShiftsWeek(
  venueId: string,
  input: {
    source_start_date: string;
    target_start_date: string;
  },
): Promise<{ shifts: WorkShift[]; created_count: number; skipped_count: number }> {
  return apiFetch<{ shifts: WorkShift[]; created_count: number; skipped_count: number }>(
    `/api/v1/restaurant/venues/${venueId}/shifts/copy-week`,
    { method: "POST", body: input },
  );
}

export async function swapVenueWorkShiftStaff(
  venueId: string,
  shiftId: string,
  newStaffId: string,
): Promise<WorkShift> {
  const data = await apiFetch<{ shift: WorkShift }>(
    `/api/v1/restaurant/venues/${venueId}/shifts/${shiftId}/swap`,
    { method: "POST", body: { new_staff_id: newStaffId } },
  );
  return data.shift;
}

export async function listMyStaffShifts(): Promise<WorkShift[]> {
  const data = await apiFetch<{ shifts: WorkShift[] }>(
    `/api/v1/staff/shifts`,
  );
  return data.shifts ?? [];
}

export async function respondStaffShift(
  shiftId: string,
  status: "CONFIRMED" | "DECLINED" | "SWAP_REQUESTED",
  reason?: string,
): Promise<WorkShift> {
  const data = await apiFetch<{ shift: WorkShift }>(
    `/api/v1/staff/shifts/${shiftId}/respond`,
    { method: "POST", body: { status, reason } },
  );
  return data.shift;
}

/** A team role of a venue: preset (waiter, barista…) or the owner's own. */
export type VenueRole = {
  id: string;
  venue_id: string;
  key: string;
  /** Owner's name; "" = translated preset name of `key`. */
  name: string;
  color: string;
  in_schedule: boolean;
  position: number;
  is_system: boolean;
  /** Stored for phase 2 (venue-scoped access); not shown or enforced yet. */
  permissions: string[];
  created_at: string;
};

export type VenueRolesResponse = {
  venue_type: string;
  roles: VenueRole[];
  /** Preset role keys of the venue type the venue does not have yet. */
  suggested: string[];
};

export type VenueRoleInput = {
  name?: string;
  color?: string;
  in_schedule?: boolean;
  position?: number;
};

export async function listVenueRoles(venueId: string): Promise<VenueRolesResponse> {
  const data = await apiFetch<VenueRolesResponse>(`/api/v1/restaurant/venues/${venueId}/roles`);
  return { venue_type: data.venue_type ?? "", roles: data.roles ?? [], suggested: data.suggested ?? [] };
}

export async function createVenueRole(venueId: string, input: VenueRoleInput): Promise<VenueRole> {
  const data = await apiFetch<{ role: VenueRole }>(`/api/v1/restaurant/venues/${venueId}/roles`, {
    method: "POST",
    body: input,
  });
  return data.role;
}

export async function updateVenueRole(venueId: string, roleId: string, input: VenueRoleInput): Promise<VenueRole> {
  const data = await apiFetch<{ role: VenueRole }>(`/api/v1/restaurant/venues/${venueId}/roles/${roleId}`, {
    method: "PATCH",
    body: input,
  });
  return data.role;
}

/** Custom roles only; members move to `reassignTo` first (409 role_in_use without it). */
export async function deleteVenueRole(
  venueId: string,
  roleId: string,
  reassignTo?: string,
): Promise<{ ok: boolean; reassigned: number }> {
  return apiFetch<{ ok: boolean; reassigned: number }>(`/api/v1/restaurant/venues/${venueId}/roles/${roleId}`, {
    method: "DELETE",
    query: reassignTo ? { reassign_to: reassignTo } : undefined,
  });
}

/** Adds the venue type's preset roles it is missing (all or `keys`). */
export async function addVenuePresetRoles(venueId: string, keys?: string[]): Promise<VenueRole[]> {
  const data = await apiFetch<{ roles: VenueRole[] }>(`/api/v1/restaurant/venues/${venueId}/roles/preset`, {
    method: "POST",
    body: keys?.length ? { keys } : {},
  });
  return data.roles ?? [];
}

export async function assignVenueStaffRole(venueId: string, staffId: string, role: string): Promise<StaffMember> {
  const data = await apiFetch<{ staff: StaffMember }>(`/api/v1/restaurant/venues/${venueId}/staff/${staffId}`, {
    method: "PATCH",
    body: { role },
  });
  return data.staff;
}

export async function listVenueStaff(venueId: string): Promise<StaffMember[]> {
  const data = await apiFetch<{ staff: StaffMember[] }>(
    `/api/v1/restaurant/venues/${venueId}/staff`,
  );
  return data.staff ?? [];
}

export async function removeVenueStaff(
  venueId: string,
  staffId: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/v1/restaurant/venues/${venueId}/staff/${staffId}`,
    { method: "DELETE" },
  );
}

export async function toggleVenueStaffShift(
  venueId: string,
  staffId: string,
  onShift?: boolean,
): Promise<StaffMember> {
  const data = await apiFetch<{ staff: StaffMember }>(
    `/api/v1/restaurant/venues/${venueId}/staff/${staffId}/shift`,
    { method: "POST", body: { on_shift: onShift } },
  );
  return data.staff;
}

export async function staffListWaiterCalls(venueId: string) {
  return apiFetch<{ waiter_calls: { id: string; table_id: string; reason: string; status: string }[] }>(
    `/api/v1/staff/waiter-calls?venue_id=${encodeURIComponent(venueId)}`,
  );
}

export async function staffCompleteWaiterCall(id: string) {
  return apiFetch(`/api/v1/staff/waiter-calls/${id}/complete`, {
    method: "POST",
    body: {},
  });
}

/**
 * Bookings of one venue as the venue panel sees them (owner, admin or staff):
 * adds duration, guest notes, source, all held tables and the announced arrival time,
 * but no guest identity — the cabinet merges it with `listRestaurantReservations`.
 */
export async function staffListReservations(venueId: string): Promise<Reservation[]> {
  const data = await apiFetch<{ reservations: Reservation[] }>(
    `/api/v1/staff/reservations?venue_id=${encodeURIComponent(venueId)}`,
  );
  return data.reservations ?? [];
}

export async function staffListOrders(venueId: string): Promise<Order[]> {
  const data = await apiFetch<{ orders: Order[] }>(
    `/api/v1/staff/orders?venue_id=${encodeURIComponent(venueId)}`,
  );
  return data.orders ?? [];
}

export async function staffUpdateOrder(
  orderId: string,
  venueId: string,
  status: string,
): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/staff/orders/${orderId}`,
    { method: "PATCH", body: { status, venue_id: venueId } },
  );
  return data.order;
}

/** The owner's own profile change requests, newest first (all venues). */
export async function listMyChangeRequests(): Promise<ProfileChangeRequest[]> {
  const data = await apiFetch<{ change_requests: ProfileChangeRequest[] }>(
    "/api/v1/restaurant/change-requests",
  );
  return data.change_requests ?? [];
}

export async function submitProfileChangeRequest(
  applicationId: string,
  patch: ApplicationUpdate,
) {
  return apiFetch(`/api/v1/restaurant/applications/${applicationId}/change-requests`, {
    method: "POST",
    body: patch,
  });
}

/** The owner's profile change requests for all their venues (newest decisions included). */
export async function listOwnerChangeRequests(): Promise<ProfileChangeRequest[]> {
  const data = await apiFetch<{ change_requests: ProfileChangeRequest[] }>(
    "/api/v1/restaurant/change-requests",
  );
  return data.change_requests ?? [];
}

export type AdminOverview = {
  users_total: number;
  guests_total: number;
  owners_total: number;
  staff_total: number;
  venues_published: number;
  applications_pending: number;
  reservations_active: number;
  reservations_total: number;
  orders_total: number;
  orders_paid: number;
  revenue_paid_mdl: number;
  waiter_calls_pending: number;
  change_requests_open: number;
  reservations_by_status: Record<string, number>;
  orders_by_status: Record<string, number>;
};

export type AdminPerson = {
  id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
  locale: string;
  created_at: string;
  crm_object: string;
};

export type AdminCompany = {
  application_id: string;
  venue_id?: string;
  name: LocalizedString;
  status: ApplicationStatus;
  owner_email: string;
  owner_name: string;
  phone: string;
  email: string;
  city_id: string;
  average_check: number;
  cuisine: string[];
  updated_at: string;
  crm_object: string;
};

export type AdminReservationRow = {
  id: string;
  venue_id: string;
  venue_name: LocalizedString;
  table_id: string;
  table_number: number;
  guest_id: string;
  guest_name: string;
  guest_email: string;
  guests: number;
  reserved_for: string;
  status: string;
  source?: string;
  arrival_confirmed_at?: string | null;
  created_at: string;
  crm_object: string;
};

export type AdminOrderRow = {
  id: string;
  session_id: string;
  user_id: string;
  guest_name: string;
  guest_email: string;
  venue_id: string;
  venue_name: LocalizedString;
  items: OrderItem[];
  status: string;
  total: number;
  paid: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminCRMStatus = {
  enabled: boolean;
  healthy: boolean;
  running?: boolean;
  last_success_at?: string;
  last_error_at?: string;
  last_error?: string;
  crm_url: string;
  webhook_configured?: boolean;
  last_webhook_at?: string;
  objects?: string[];
};

export type ProfileChangeRequest = {
  id: string;
  application_id: string;
  owner_user_id: string;
  status: string;
  patch: ApplicationUpdate;
  created_at: string;
  note?: string;
};

export async function adminOverview(): Promise<AdminOverview> {
  const data = await apiFetch<{ overview: AdminOverview }>("/api/v1/admin/overview");
  return data.overview;
}

export async function adminListPeople(): Promise<AdminPerson[]> {
  const data = await apiFetch<{ people: AdminPerson[] }>("/api/v1/admin/people");
  return data.people ?? [];
}

export async function adminListCompanies(): Promise<AdminCompany[]> {
  const data = await apiFetch<{ companies: AdminCompany[] }>("/api/v1/admin/companies");
  return data.companies ?? [];
}

export async function adminListReservations(): Promise<AdminReservationRow[]> {
  const data = await apiFetch<{ reservations: AdminReservationRow[] }>(
    "/api/v1/admin/reservations",
  );
  return data.reservations ?? [];
}

export async function adminListOrders(): Promise<AdminOrderRow[]> {
  const data = await apiFetch<{ orders: AdminOrderRow[] }>("/api/v1/admin/orders");
  return data.orders ?? [];
}

export async function adminCRMStatus(): Promise<AdminCRMStatus> {
  return apiFetch<AdminCRMStatus>("/api/v1/admin/crm/status");
}

export async function adminReconcileCRM(): Promise<void> {
  await apiFetch("/api/v1/admin/integrations/twenty/reconcile", {
    method: "POST",
    body: {},
  });
}

export async function adminListChangeRequests(): Promise<ProfileChangeRequest[]> {
  const data = await apiFetch<{ change_requests: ProfileChangeRequest[] }>(
    "/api/v1/admin/change-requests",
  );
  return data.change_requests ?? [];
}

export async function adminReviewChangeRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  note?: string,
): Promise<ProfileChangeRequest> {
  const data = await apiFetch<{ change_request: ProfileChangeRequest }>(
    `/api/v1/admin/change-requests/${id}/review`,
    { method: "POST", body: { status, note } },
  );
  return data.change_request;
}



/** The reservation's active preorder (404 when there is none). */
export async function fetchPreorder(reservationId: string): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/reservations/${reservationId}/preorder`);
  return data.order;
}

/** Creates or replaces the preorder for the guest's reservation; prices are fixed when saved. */
export async function savePreorder(
  reservationId: string,
  items: { menu_item_id: string; qty: number }[],
): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/reservations/${reservationId}/preorder`, {
    method: "PUT",
    body: { items },
  });
  return data.order;
}

/** Cancels the preorder before the kitchen starts it. */
export async function cancelPreorder(reservationId: string): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/reservations/${reservationId}/preorder`, {
    method: "DELETE",
  });
  return data.order;
}

export type NotificationKind =
  | "PREORDER_CREATED"
  | "PREORDER_UPDATED"
  | "PREORDER_CANCELLED"
  | "PREORDER_PREPARING"
  | "PREORDER_ADULT_REMOVED"
  | "PREORDER_AGE_REFUSED"
  | "ADULT_GRANTED"
  | "ADULT_REVOKED";

/** In-app notification (GET /me/notifications, live via /me/notifications/stream). */
export type AppNotification = {
  id: string;
  user_id: string;
  kind: NotificationKind | string;
  venue_id?: string;
  venue_name?: LocalizedString;
  reservation_id?: string;
  order_id?: string;
  at?: string;
  created_at: string;
  read_at?: string;
};

export async function fetchNotifications(limit = 30): Promise<{ notifications: AppNotification[]; unread: number }> {
  const data = await apiFetch<{ notifications: AppNotification[]; unread: number }>("/api/v1/me/notifications", {
    query: { limit },
  });
  return { notifications: data.notifications ?? [], unread: data.unread ?? 0 };
}

/** Marks the given notifications read (all when `ids` is omitted); returns the new unread count. */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const data = await apiFetch<{ unread: number }>("/api/v1/me/notifications/read", {
    method: "POST",
    body: ids ? { ids } : {},
  });
  return data.unread ?? 0;
}

/**
 * Opens the live notification stream (Server-Sent Events over fetch, so the Bearer
 * token goes in a header). Resolves when the stream ends; rejects on HTTP errors.
 */
export async function openNotificationStream(
  onEvent: (event: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = getToken();
  if (!token) throw new ApiError(401, "unauthorized");
  const url = new URL(`${API_URL}/api/v1/me/notifications/stream`, window.location.origin);
  const res = await fetch(url.toString(), {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, `http_${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser(onEvent);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    parser(value);
  }
}

/** Incremental text/event-stream parser: feed it chunks, it calls `onEvent` per complete event. */
export function createSseParser(onEvent: (event: string, data: string) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) onEvent(event, data.join("\n"));
      end = buffer.indexOf("\n\n");
    }
  };
}

export type PreorderMenuItem = MenuItem & {
  orderable: boolean;
  blocked_reason?: "stopped" | "age_verification_required" | string;
};

/** Venue menu as the current guest may preorder it (18+ blocked without verification). */
export async function fetchPreorderMenu(venueId: string): Promise<PreorderMenuItem[]> {
  const data = await apiFetch<{ menu: PreorderMenuItem[] }>(`/api/v1/me/venues/${venueId}/preorder-menu`);
  return data.menu ?? [];
}

/** Uploads a profile photo (JPEG/PNG/WebP ≤ 5 MB); the server stores a 512 px square JPEG. */
export async function uploadAvatar(file: File): Promise<User> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const url = new URL(`${API_URL}/api/v1/me/avatar`, window.location.origin);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) code = err.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }
  return ((await res.json()) as { user: User }).user;
}

export async function deleteAvatar(): Promise<User> {
  const data = await apiFetch<{ user: User }>("/api/v1/me/avatar", { method: "DELETE" });
  return data.user;
}

/** GDPR account deletion (guests). Errors: wrong_password, role_not_allowed. */
export async function deleteAccount(password: string): Promise<{ deleted: boolean; cancelled_reservations: number }> {
  // An account created with Google without a password sends none.
  return apiFetch("/api/v1/me", { method: "DELETE", body: password ? { password } : {} });
}
