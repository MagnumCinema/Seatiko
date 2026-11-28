"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchTables,
  fetchVenue,
  listRestaurantReservations,
  staffListOrders,
  staffListReservations,
  staffListWaiterCalls,
  staffListWaitlist,
  type Order,
  type Reservation,
  type Table,
  type Venue,
  type WaiterCall,
  type WaitlistEntry,
} from "@/lib/api";
import { dayKey, formatClock, formatDateTime } from "@/lib/cabinet-bookings";
import { newCallIds } from "@/lib/staff-floor";
import type { getSiteCopy } from "@/lib/site-copy";

export type StaffCopy = ReturnType<typeof getSiteCopy>["staff"];

/** Calls, orders, the queue and the floor refresh this often while the page is visible. */
export const POLL_MS = 15_000;
/** Bookings change slower: every fourth poll. */
const BOOKINGS_EVERY = 4;
/** Back to a tab after this long → refresh at once. */
const FOCUS_REFRESH_GAP_MS = 5_000;
/** A new call stays highlighted this long. */
const FRESH_MS = 12_000;

export type FloorState = "loading" | "ready" | "failed" | "forbidden";

export type StaffFloor = {
  state: FloorState;
  calls: WaiterCall[];
  orders: Order[];
  queue: WaitlistEntry[];
  tables: Table[];
  bookings: Reservation[];
  /** Booking id → guest name (owners only: the staff list has no names yet, backend task №53). */
  names: Map<string, string>;
  venue: Venue | null;
  /** The last refresh failed: data on screen is from `updatedAt`. */
  stale: boolean;
  refreshing: boolean;
  updatedAt: number | null;
  /** Calls that appeared since the previous refresh. */
  fresh: Set<string>;
  reload: () => Promise<void>;
};

const settle = <T,>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

const denied = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 404);

/**
 * Live data of one venue for the staff panel: polled every 15 s while the page is visible and
 * at once on return to it. A failed refresh keeps the last data and marks it stale.
 */
export function useStaffFloor(venueId: string, withNames: boolean): StaffFloor {
  const [state, setState] = useState<FloorState>("loading");
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [queue, setQueue] = useState<WaitlistEntry[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [venue, setVenue] = useState<Venue | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const requestRef = useRef(0);
  const pollRef = useRef(0);
  const callsRef = useRef<WaiterCall[] | null>(null);
  const updatedAtRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!venueId) return;
    const request = ++requestRef.current;
    const withBookings = pollRef.current++ % BOOKINGS_EVERY === 0;
    setRefreshing(true);
    const [callsRes, ordersRes, queueRes, tablesRes, bookingsRes, namesRes, venueRes] = await Promise.all([
      settle(staffListWaiterCalls(venueId)),
      settle(staffListOrders(venueId)),
      settle(staffListWaitlist(venueId)),
      settle(fetchTables(venueId)),
      withBookings ? settle(staffListReservations(venueId)) : null,
      withBookings && withNames ? settle(listRestaurantReservations()) : null,
      withBookings ? settle(fetchVenue(venueId)) : null,
    ]);
    if (request !== requestRef.current) return;
    setRefreshing(false);

    // The venue gate answers the same for every staff route: 403 (not in the team) or 404.
    if (!callsRes.ok && denied(callsRes.error)) {
      setState("forbidden");
      return;
    }
    const core = [callsRes, ordersRes, queueRes, tablesRes];
    if (core.every((r) => !r.ok)) {
      setStale(true);
      setState((current) => (current === "ready" ? current : "failed"));
      return;
    }

    if (callsRes.ok) {
      const ids = newCallIds(callsRef.current, callsRes.value);
      callsRef.current = callsRes.value;
      setCalls(callsRes.value);
      if (ids.length) {
        setFresh((current) => new Set([...current, ...ids]));
        window.setTimeout(() => {
          setFresh((current) => new Set([...current].filter((id) => !ids.includes(id))));
        }, FRESH_MS);
      }
    }
    if (ordersRes.ok) setOrders(ordersRes.value);
    if (queueRes.ok) setQueue(queueRes.value);
    if (tablesRes.ok) setTables(tablesRes.value);
    if (bookingsRes?.ok) setBookings(bookingsRes.value);
    if (namesRes?.ok) {
      setNames(new Map(namesRes.value.filter((r) => r.venue_id === venueId).map((r) => [r.id, r.guest_name ?? ""])));
    }
    if (venueRes?.ok) setVenue(venueRes.value);
    const failed = core.some((r) => !r.ok) || bookingsRes?.ok === false;
    setStale(failed);
    const at = Date.now();
    updatedAtRef.current = at;
    setUpdatedAt(at);
    setState("ready");
  }, [venueId, withNames]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      requestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (updatedAtRef.current && Date.now() - updatedAtRef.current < FOCUS_REFRESH_GAP_MS) return;
      void load();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [load]);

  return { state, calls, orders, queue, tables, bookings, names, venue, stale, refreshing, updatedAt, fresh, reload: load };
}

/** A clock that ticks every 15 seconds (waiting times, "now" lines). */
export function useNow(step = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), step);
    return () => window.clearInterval(timer);
  }, [step]);
  return now;
}

/** "4 мин", "1 ч 5 мин", "только что". */
export function waitText(minutes: number, copy: StaffCopy): string {
  if (minutes < 1) return copy.justNow;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return copy.minutes.replace("{m}", String(m));
  return copy.hoursMinutes.replace("{h}", String(h)).replace("{m}", String(m));
}

/** "16:05" today, "25 нояб., 16:05" on another day (venue time). */
export function clockOrDate(ms: number, now: number, locale: string): string {
  return dayKey(ms) === dayKey(now) ? formatClock(ms) : formatDateTime(ms, locale);
}

/** "только что" or "4 мин назад". */
export function agoText(minutes: number, copy: StaffCopy): string {
  return minutes < 1 ? copy.justNow : fill(copy.ago, { time: waitText(minutes, copy) });
}

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** A failed staff action as a sentence for the person (never a raw server code). */
export function actionErrorText(error: unknown, copy: StaffCopy): string {
  if (!(error instanceof ApiError)) return copy.errors.network;
  if (error.status === 403) return copy.errors.forbidden;
  if (error.code === "already_accepted") return copy.errors.alreadyAccepted;
  if (error.code === "table_not_free") return copy.errors.tableNotFree;
  if (error.code === "age_check_pending") return copy.errors.ageCheckPending;
  if (error.status === 409) return copy.errors.changed;
  return copy.errors.action;
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

/** Date, venue clock, "updated at" and a refresh button above a live tab. */
export function StaffDayBar({
  copy,
  dateLine,
  now,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  copy: StaffCopy;
  dateLine: string;
  now: number;
  updatedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="sf-daybar">
      <div className="sf-daybar-date">
        <strong>{dateLine}</strong>
        <span>{fill(copy.clock, { time: formatClock(now) })}</span>
      </div>
      <div className="sf-daybar-refresh" title={copy.liveHint}>
        <i className="sf-live-dot" aria-hidden="true" />
        {updatedAt && <small>{fill(copy.updatedAt, { time: formatClock(updatedAt) })}</small>}
        <button
          type="button"
          className="btn btn--secondary btn--sm btn--icon sf-icon-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? copy.refreshing : copy.refresh}
          title={refreshing ? copy.refreshing : copy.refresh}
        >
          <span className={refreshing ? "sf-spin" : ""}>
            <RefreshIcon />
          </span>
        </button>
      </div>
    </div>
  );
}

/** Empty or failed state of a tab, in the cabinet's style. */
export function StaffEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="owner-section-empty sf-empty">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
