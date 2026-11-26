/**
 * Owner cabinet → «История действий»: turns the application activity journal
 * (GET /restaurant/applications/:id/activity) and the owner's profile change
 * requests (GET /restaurant/change-requests) into a readable, filterable feed.
 * Pure functions only; the panel lives in components/cabinet-history.tsx.
 */
import type { ApplicationActivity, ApplicationUpdate, ProfileChangeRequest } from "@/lib/api";
import { addDays, dayKey, normalizeSearch, VENUE_TIME_ZONE } from "@/lib/cabinet-bookings";

/** Actions the API writes today (applications.service.ts, crm.repository.ts). */
export const KNOWN_ACTIONS = [
  "APPLICATION_CREATED",
  "PROFILE_UPDATED",
  "PHOTO_ADDED",
  "PHOTO_REMOVED",
  "APPLICATION_SUBMITTED",
  "REVIEW_STARTED",
  "APPLICATION_APPROVED",
  "APPLICATION_REJECTED",
  "APPLICATION_PUBLISHED",
  "PROFILE_CHANGE_REQUESTED",
  "PROFILE_CHANGE_APPROVED",
  "PROFILE_CHANGE_REJECTED",
  "CRM_PROFILE_UPDATED",
] as const;
export type KnownAction = (typeof KNOWN_ACTIONS)[number];

export type HistoryCategory = "profile" | "photos" | "moderation" | "changes" | "other";
export type HistoryTone = "ok" | "info" | "warn" | "danger" | "muted";
/** Where an entry's link leads: a cabinet section or the public venue page. */
export type HistoryTarget = "profile" | "overview" | "venue" | null;
export type HistoryActor = "owner" | "seatiko" | "system" | "staff";

type ActionMeta = { category: HistoryCategory; tone: HistoryTone; target: HistoryTarget };

const ACTION_META: Record<KnownAction, ActionMeta> = {
  APPLICATION_CREATED: { category: "profile", tone: "muted", target: "profile" },
  PROFILE_UPDATED: { category: "profile", tone: "info", target: "profile" },
  PHOTO_ADDED: { category: "photos", tone: "info", target: "profile" },
  PHOTO_REMOVED: { category: "photos", tone: "warn", target: "profile" },
  APPLICATION_SUBMITTED: { category: "moderation", tone: "info", target: "overview" },
  REVIEW_STARTED: { category: "moderation", tone: "muted", target: "overview" },
  APPLICATION_APPROVED: { category: "moderation", tone: "ok", target: "overview" },
  APPLICATION_REJECTED: { category: "moderation", tone: "danger", target: "profile" },
  APPLICATION_PUBLISHED: { category: "moderation", tone: "ok", target: "venue" },
  PROFILE_CHANGE_REQUESTED: { category: "changes", tone: "info", target: "profile" },
  PROFILE_CHANGE_APPROVED: { category: "changes", tone: "ok", target: "profile" },
  PROFILE_CHANGE_REJECTED: { category: "changes", tone: "danger", target: "profile" },
  CRM_PROFILE_UPDATED: { category: "profile", tone: "info", target: "profile" },
};

const OTHER_META: ActionMeta = { category: "other", tone: "muted", target: null };

export const isKnownAction = (action: string): action is KnownAction =>
  (KNOWN_ACTIONS as readonly string[]).includes(action);

export const actionMeta = (action: string): ActionMeta => (isKnownAction(action) ? ACTION_META[action] : OTHER_META);

/**
 * One field name for the same thing: the journal writes `hours`, `city`, `latitude`,
 * a change request patch carries `hours_text`, `city_id`, `lat`. Map point halves
 * collapse into one `location`.
 */
export type HistoryField =
  | "name"
  | "description"
  | "address"
  | "cuisine"
  | "venue_type"
  | "phone"
  | "email"
  | "website"
  | "city"
  | "location"
  | "price_level"
  | "average_check"
  | "hours"
  | "photos";

export const FIELD_ORDER: HistoryField[] = [
  "name",
  "venue_type",
  "description",
  "cuisine",
  "city",
  "address",
  "location",
  "phone",
  "email",
  "website",
  "hours",
  "price_level",
  "average_check",
  "photos",
];

const FIELD_ALIASES: Record<string, HistoryField> = {
  hours_text: "hours",
  city_id: "city",
  latitude: "location",
  longitude: "location",
  lat: "location",
  lng: "location",
};

export function normalizeField(key: string): HistoryField | null {
  const field = FIELD_ALIASES[key] ?? key;
  return (FIELD_ORDER as string[]).includes(field) ? (field as HistoryField) : null;
}

/** Known fields in display order, without duplicates; unknown keys are kept at the end as they are. */
export function normalizeFields(keys: readonly string[] | null | undefined): string[] {
  const known = new Set<HistoryField>();
  const unknown: string[] = [];
  for (const key of keys ?? []) {
    const field = normalizeField(key);
    if (field) known.add(field);
    else if (key && !unknown.includes(key)) unknown.push(key);
  }
  return [...FIELD_ORDER.filter((field) => known.has(field)), ...unknown];
}

export type HistoryEntry = {
  id: string;
  appId: string;
  /** Instant in ms. */
  at: number;
  action: string;
  known: boolean;
  category: HistoryCategory;
  tone: HistoryTone;
  target: HistoryTarget;
  actor: HistoryActor;
  /** Normalized field keys (see normalizeFields). Photo actions carry none: the title says it. */
  fields: string[];
  note: string;
};

/** Who did it, from the owner's point of view. */
export function actorOf(entry: Pick<ApplicationActivity, "actor_role" | "actor_user_id">, ownerId: string): HistoryActor {
  if (entry.actor_role === "admin") return "seatiko";
  if (entry.actor_role === "system" || !entry.actor_user_id) return "system";
  if (entry.actor_user_id === ownerId) return "owner";
  return "staff";
}

export function toHistoryEntry(raw: ApplicationActivity, ownerId: string): HistoryEntry | null {
  const at = Date.parse(raw.created_at);
  if (!Number.isFinite(at)) return null;
  const meta = actionMeta(raw.action);
  const photo = meta.category === "photos";
  return {
    id: raw.id,
    appId: raw.application_id,
    at,
    action: raw.action,
    known: isKnownAction(raw.action),
    category: meta.category,
    tone: meta.tone,
    target: meta.target,
    actor: actorOf(raw, ownerId),
    fields: photo ? [] : normalizeFields(raw.changed_fields),
    note: (raw.note ?? "").trim(),
  };
}

/** Newest first; ties keep a stable order by id so the list does not jump on refresh. */
export function sortEntries<T extends { at: number; id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/* ---------- Change requests ---------- */

/** The request row is written a few ms before its journal entry, in the same transaction. */
const REQUEST_MATCH_MS = 5_000;

/**
 * Pairs journal entries with the owner's change requests:
 * - PROFILE_CHANGE_REQUESTED ↔ the request of the same venue created within a few seconds;
 * - PROFILE_CHANGE_APPROVED / _REJECTED ↔ the only request of that venue with that outcome
 *   (and, for a rejection, the same note) created before it and not paired yet.
 * When more than one request fits, the entry stays unpaired rather than guessing.
 */
export function linkChangeRequests(
  entries: HistoryEntry[],
  requests: ProfileChangeRequest[],
): Map<string, ProfileChangeRequest> {
  const links = new Map<string, ProfileChangeRequest>();
  const used = new Set<string>();
  const parsed = requests
    .map((request) => ({ request, at: Date.parse(request.created_at) }))
    .filter((row) => Number.isFinite(row.at));
  const chronological = [...entries].sort((a, b) => a.at - b.at);

  for (const entry of chronological) {
    if (entry.action !== "PROFILE_CHANGE_REQUESTED") continue;
    let best: { request: ProfileChangeRequest; gap: number } | null = null;
    for (const row of parsed) {
      if (row.request.application_id !== entry.appId || used.has(row.request.id)) continue;
      const gap = Math.abs(entry.at - row.at);
      if (gap <= REQUEST_MATCH_MS && (!best || gap < best.gap)) best = { request: row.request, gap };
    }
    if (best) {
      links.set(entry.id, best.request);
      used.add(best.request.id);
    }
  }

  const reviewed = new Set<string>();
  for (const entry of chronological) {
    const status =
      entry.action === "PROFILE_CHANGE_APPROVED" ? "APPROVED" : entry.action === "PROFILE_CHANGE_REJECTED" ? "REJECTED" : null;
    if (!status) continue;
    const fits = parsed.filter(
      (row) =>
        row.request.application_id === entry.appId &&
        row.request.status === status &&
        row.at <= entry.at &&
        !reviewed.has(row.request.id) &&
        (status !== "REJECTED" || !entry.note || (row.request.note ?? "").trim() === entry.note),
    );
    if (fits.length === 1) {
      links.set(entry.id, fits[0].request);
      reviewed.add(fits[0].request.id);
    }
  }
  return links;
}

export type PatchRow = { field: HistoryField; value: unknown };

/** The requested values of a change request, one row per field in display order. */
export function patchRows(patch: ApplicationUpdate | null | undefined): PatchRow[] {
  if (!patch) return [];
  const rows = new Map<HistoryField, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const field = normalizeField(key);
    if (!field) continue;
    if (field === "location") {
      const point = (rows.get("location") as { lat?: number; lng?: number } | undefined) ?? {};
      if (key === "lat" || key === "latitude") point.lat = Number(value);
      else point.lng = Number(value);
      rows.set("location", point);
    } else {
      rows.set(field, value);
    }
  }
  return FIELD_ORDER.filter((field) => rows.has(field)).map((field) => ({ field, value: rows.get(field) }));
}

/** Long texts (a description) are cut for the feed. */
export function clip(value: string, max = 140): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ---------- Filters ---------- */

export type HistoryPeriod = "all" | "today" | "7d" | "30d" | "90d";
export type HistoryWho = "all" | HistoryActor;
export type HistoryCategoryFilter = "all" | HistoryCategory;

export type HistoryFilters = {
  category: HistoryCategoryFilter;
  who: HistoryWho;
  period: HistoryPeriod;
  query: string;
};

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = { category: "all", who: "all", period: "all", query: "" };

const PERIOD_DAYS: Record<Exclude<HistoryPeriod, "all">, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

/** First venue day ("YYYY-MM-DD") the period includes, or null for all time. */
export function periodFirstDay(period: HistoryPeriod, now: number, timeZone = VENUE_TIME_ZONE): string | null {
  if (period === "all") return null;
  return addDays(dayKey(now, timeZone), 1 - PERIOD_DAYS[period]);
}

export function filtersActive(filters: HistoryFilters): boolean {
  return (
    filters.category !== "all" || filters.who !== "all" || filters.period !== "all" || filters.query.trim() !== ""
  );
}

/**
 * Entries that pass every filter. `textOf` gives the visible text of an entry
 * (title, people, fields, values, note, venue) for the search.
 */
export function filterEntries<T extends HistoryEntry>(
  list: T[],
  filters: HistoryFilters,
  now: number,
  textOf: (entry: T) => string,
  timeZone = VENUE_TIME_ZONE,
): T[] {
  const firstDay = periodFirstDay(filters.period, now, timeZone);
  const words = normalizeSearch(filters.query).split(/\s+/).filter(Boolean);
  return list.filter((entry) => {
    if (filters.category !== "all" && entry.category !== filters.category) return false;
    if (filters.who !== "all" && entry.actor !== filters.who) return false;
    if (firstDay && dayKey(entry.at, timeZone) < firstDay) return false;
    if (words.length) {
      const haystack = normalizeSearch(textOf(entry));
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export function countBy<T, K extends string>(list: T[], key: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const item of list) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export type HistoryDayGroup<T> = { day: string; entries: T[] };

/** Consecutive days of an already sorted list (newest first), by the venue calendar. */
export function groupEntriesByDay<T extends { at: number }>(list: T[], timeZone = VENUE_TIME_ZONE): HistoryDayGroup<T>[] {
  const groups: HistoryDayGroup<T>[] = [];
  for (const entry of list) {
    const day = dayKey(entry.at, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

/* ---------- Export ---------- */

function csvCell(value: string): string {
  // Leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with a BOM so Excel opens Cyrillic and Romanian letters correctly. */
export function toCsv(rows: string[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
