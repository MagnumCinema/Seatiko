import { appendFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

/** Base URL of the API under test (Go or Nest). */
export const BASE_URL = (process.env.CONTRACT_BASE_URL ?? 'http://127.0.0.1:18090').replace(/\/$/, '');

/** Where hits are recorded for the route coverage report (see coverage.global.ts). */
export const HITS_FILE = process.env.CONTRACT_HITS_FILE ?? '';

export type ApiResponse<T = any> = { status: number; body: T; headers: Headers };

type Options = {
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  form?: FormData;
  headers?: Record<string, string>;
};

export async function api<T = any>(method: string, path: string, opts: Options = {}): Promise<ApiResponse<T>> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res = await fetch(url, { method, headers, body });
  // Sign-up / sign-in are rate limited per IP (40/min): wait for the window instead of failing.
  for (let attempt = 0; res.status === 429 && path.startsWith('/api/v1/auth/') && attempt < 14; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    res = await fetch(url, { method, headers, body });
  }
  if (HITS_FILE) appendFileSync(HITS_FILE, `${method} ${path.split('?')[0]}\n`);
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body (YAML, HTML, image) */
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

export const DEMO = {
  admin: { email: 'admin@seatiko.local', password: 'admin123' },
  guest: { email: 'guest@seatiko.local', password: 'guest123' },
  owner: { email: 'owner@seatiko.local', password: 'owner123' },
  staff: { email: 'staff@seatiko.local', password: 'staff123' },
} as const;

const tokens = new Map<string, Promise<string>>();

/** Signs in once per account and reuses the token (the auth routes are rate limited). */
export function login(email: string, password: string): Promise<string> {
  const key = `${email}:${password}`;
  if (!tokens.has(key)) {
    tokens.set(key, api('POST', '/api/v1/auth/login', { body: { email, password } }).then((res) => {
      if (res.status !== 200 || !res.body?.token) {
        tokens.delete(key);
        throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.token as string;
    }));
  }
  return tokens.get(key)!;
}

let counter = 0;
/** Registers a fresh guest with a unique email; returns its token and user. */
export async function newGuest(prefix = 'guest'): Promise<{ token: string; user: any; email: string; password: string }> {
  const email = `${prefix}-${Date.now()}-${process.pid}-${++counter}@contract.test`;
  const password = 'secret123';
  const res = await api('POST', '/api/v1/auth/register', { body: { email, password, first_name: 'Test', last_name: 'Guest' } });
  if (res.status !== 201) throw new Error(`register: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email, password };
}

/** ISO date (YYYY-MM-DD) of a day relative to today in the venues' time zone. */
export function chisinauDate(daysFromToday: number): string {
  const now = new Date(Date.now() + daysFromToday * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(now);
}

/** A free slot of a venue on a day, from GET /availability. */
export async function freeSlot(venueId: string, daysFromToday = 1, guests = 2): Promise<{ starts_at: string; table_id: string }> {
  const res = await api('GET', '/api/v1/availability', { query: { date: chisinauDate(daysFromToday), guests, limit: 12 } });
  const venue = res.body?.venues?.find((v: any) => v.venue_id === venueId);
  const slot = venue?.slots?.at(-1);
  if (!slot) throw new Error(`no free slot at ${venueId}`);
  return slot;
}

/** A small valid PNG (solid grey), built without image libraries. */
export function pngBlob(width = 4, height = 4): Blob {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 160)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Blob([new Uint8Array(png)], { type: 'image/png' });
}

export const VENUE_PROFILE = {
  name: { ru: 'Контрактный ресторан', en: 'Contract Restaurant', ro: 'Restaurant Contract' },
  description: { ru: 'Тестовое заведение', en: 'Test venue', ro: 'Local de test' },
  address: { ru: 'ул. Тестовая 1', en: 'Test St 1', ro: 'Str. Test 1' },
  cuisine: ['moldovan'],
  phone: '+37369000001',
  email: 'venue@contract.test',
  city_id: 'city-balti',
  lat: 47.76,
  lng: 27.93,
  price_level: 2,
  average_check: 250,
  hours_text: 'Пн–Вс 10:00–22:00',
};

/** Registers a restaurant owner. */
export async function newOwner(): Promise<{ token: string; user: any; email: string }> {
  const email = `owner-${Date.now()}-${process.pid}-${++counter}@contract.test`;
  const res = await api('POST', '/api/v1/auth/register', { body: { email, password: 'secret123', first_name: 'Owner', role: 'restaurant' } });
  if (res.status !== 201) throw new Error(`register owner: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email };
}

/**
 * A venue of its own for a suite: owner signs up, fills and submits the application,
 * admin publishes it, owner sets 4 tables and turns preorder on. Isolates the suite
 * from bookings other suites make at the pilot venues.
 */
export async function publishedVenue(): Promise<{ venueId: string; ownerToken: string; tables: any[] }> {
  const owner = await newOwner();
  const admin = await login(DEMO.admin.email, DEMO.admin.password);
  const created = await api('POST', '/api/v1/restaurant/applications', { token: owner.token });
  const appId = created.body.application.id;
  await api('PATCH', `/api/v1/restaurant/applications/${appId}`, { token: owner.token, body: VENUE_PROFILE });
  const form = new FormData();
  form.append('photo', pngBlob(), 'front.png');
  await api('POST', `/api/v1/restaurant/applications/${appId}/photos`, { token: owner.token, form });
  await api('POST', `/api/v1/restaurant/applications/${appId}/submit`, { token: owner.token });
  for (const status of ['UNDER_REVIEW', 'APPROVED']) {
    await api('POST', `/api/v1/admin/applications/${appId}/review`, { token: admin, body: { status } });
  }
  const published = await api('POST', `/api/v1/admin/applications/${appId}/publish`, { token: admin });
  const venueId = published.body.venue_id;
  if (!venueId) throw new Error(`publish: ${JSON.stringify(published.body)}`);
  await api('PUT', `/api/v1/restaurant/venues/${venueId}/tables`, {
    token: owner.token,
    body: { tables: [2, 4, 4, 6].map((seats, i) => ({ number: i + 1, seats, x: 0.2 * (i + 1), y: 0.4, zone: 'hall' })) },
  });
  await api('PATCH', `/api/v1/restaurant/venues/${venueId}/booking-rules`, { token: owner.token, body: { allow_preorder: true } });
  const qr = await api('GET', `/api/v1/restaurant/venues/${venueId}/qr`, { token: owner.token });
  return { venueId, ownerToken: owner.token, tables: qr.body.tables };
}
