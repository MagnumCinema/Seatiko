import { AUTH_CHANGE_EVENT, PROFILE_CHANGE_EVENT } from "@/lib/header-auth";

// Empty string → same origin through nginx (:80) → /api/v1/...
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const TOKEN_KEY = "fa_token";

export type LocaleCode = "ru" | "en" | "ro";
export type UserRole = "guest" | "restaurant" | "admin";

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
  venue_id?: string;
  free_tables?: number;
  open_now?: boolean | null;
  cuisine?: string[];
  price_level?: number;
  average_check?: number;
  website?: string;
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
  created_at: string;
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
  changed_fields: string[];
  note?: string;
  created_at: string;
};

export type ApplicationUpdate = {
  name?: LocalizedString;
  description?: LocalizedString;
  address?: LocalizedString;
  cuisine?: string[];
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
  /** `popular` | `vegetarian` | `spicy`. */
  tags?: string[];
  position?: number;
  stopped?: boolean;
};

export type OrderItem = {
  menu_item_id: string;
  name: LocalizedString;
  qty: number;
  price: number;
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

export type DiscoverResult = {
  venues: Venue[];
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
  options: { includeGoogle: boolean; locale: LocaleCode; bounds?: MapBounds; signal?: AbortSignal },
): Promise<MapPlacesResponse> {
  const { bounds, includeGoogle, locale, signal } = options;
  return apiFetch<MapPlacesResponse>("/api/v1/map/places", {
    auth: false,
    signal,
    query: {
      city_id: cityId,
      lang: locale,
      include_google: String(includeGoogle),
      bounds: bounds && [bounds.south, bounds.west, bounds.north, bounds.east].join(","),
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
  old_password: string;
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
  email: string;
  role: string;
  status: string;
  created_at: string;
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
): Promise<StaffMember> {
  const data = await apiFetch<{ staff: StaffMember }>(
    `/api/v1/restaurant/venues/${venueId}/staff/invite`,
    { method: "POST", body: { email } },
  );
  return data.staff;
}

export async function listVenueStaff(venueId: string): Promise<StaffMember[]> {
  const data = await apiFetch<{ staff: StaffMember[] }>(
    `/api/v1/restaurant/venues/${venueId}/staff`,
  );
  return data.staff ?? [];
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

export async function submitProfileChangeRequest(
  applicationId: string,
  patch: ApplicationUpdate,
) {
  return apiFetch(`/api/v1/restaurant/applications/${applicationId}/change-requests`, {
    method: "POST",
    body: patch,
  });
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


