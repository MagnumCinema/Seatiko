import { appendFileSync } from 'node:fs';

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
