// Empty string → same origin through nginx (:80) → /api/v1/...
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const TOKEN_KEY = "fa_token";

export type LocaleCode = "ru" | "en" | "ro";

export type LocalizedString = { ru: string; en: string; ro: string };

export type City = {
  id: string;
  slug: string;
  name: LocalizedString;
  available: boolean;
  country: string;
};

export type Venue = {
  id: string;
  city_id: string;
  name: LocalizedString;
  description: LocalizedString;
  cuisine: string[];
  rating: number;
  price_level: number;
  address: LocalizedString;
  lat: number;
  lng: number;
  average_check: number;
  open_now: boolean;
  free_tables: number;
  image_url: string;
  alcohol_license_valid?: boolean;
  session_start_before_min?: number;
  release_before_min?: number;
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
};

export type User = {
  id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  locale: string;
  created_at: string;
};

export type AuthResponse = { token: string; user: User };

export type Reservation = {
  id: string;
  user_id: string;
  venue_id: string;
  table_id: string;
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
  price: number;
  contains_alcohol: boolean;
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
};

export type HolidayCollection = {
  id: string;
  slug: string;
  title: LocalizedString;
  venue_ids: string[];
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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
};

async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
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

export async function fetchVenue(id: string): Promise<Venue> {
  const data = await apiFetch<{ venue: Venue }>(`/api/v1/venues/${id}`, {
    auth: false,
  });
  return data.venue;
}

export async function fetchTables(venueId: string): Promise<Table[]> {
  const data = await apiFetch<{ tables: Table[] }>(
    `/api/v1/venues/${venueId}/tables`,
    { auth: false },
  );
  return data.tables ?? [];
}

export async function fetchMenu(venueId: string): Promise<MenuItem[]> {
  const data = await apiFetch<{ items: MenuItem[] }>(
    `/api/v1/venues/${venueId}/menu`,
    { auth: false },
  );
  return data.items ?? [];
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
  locale?: string;
}): Promise<User> {
  const data = await apiFetch<{ user: User }>("/api/v1/me", {
    method: "PATCH",
    body: input,
  });
  return data.user;
}

export async function createReservation(input: {
  venue_id: string;
  table_id: string;
  guests: number;
  reserved_for: string;
}): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    "/api/v1/reservations",
    { method: "POST", body: input },
  );
  return data.reservation;
}

export async function fetchReservations(): Promise<Reservation[]> {
  const data = await apiFetch<{ reservations: Reservation[] }>(
    "/api/v1/reservations",
  );
  return data.reservations ?? [];
}

export async function openSessionFromQr(token: string): Promise<QrSessionResponse> {
  return apiFetch<QrSessionResponse>("/api/v1/sessions/qr", {
    method: "POST",
    body: { token },
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
  const data = await apiFetch<{ order: Order }>("/api/v1/orders", {
    method: "POST",
    body: input,
  });
  return data.order;
}

export async function callWaiter(input: {
  session_id: string;
  reason: string;
}): Promise<{ id: string; status: string }> {
  return apiFetch("/api/v1/waiter-calls", {
    method: "POST",
    body: input,
  });
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
  return apiFetch("/api/v1/table-watches", {
    method: "POST",
    body: input,
  });
}

export async function confirmArrival(
  reservationId: string,
): Promise<Reservation> {
  const data = await apiFetch<{ reservation: Reservation }>(
    `/api/v1/reservations/${reservationId}/confirm-arrival`,
    { method: "POST", body: {} },
  );
  return data.reservation;
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
