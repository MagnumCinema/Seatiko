import type { Order, Reservation, Table, WaiterCall, WaitlistEntry, WorkShift } from "@/lib/api";
import {
  dayKey,
  type BookingSource,
  type CabinetBooking,
  type VenueBookingRules,
  VENUE_TIME_ZONE,
} from "@/lib/cabinet-bookings";
import { shiftSpan } from "@/lib/shift-schedule";

/**
 * The staff panel (/staff) during service: waiter calls, the order board, the walk-in queue,
 * today's bookings and the person's own shift. Pure functions, no React; times are venue time
 * (Europe/Chisinau), as everywhere in the venue panels.
 */

const MINUTE = 60_000;

const time = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
};

/** Whole minutes from `iso` to `now` (0 for a future or unreadable time). */
export function minutesSince(iso: string | null | undefined, now: number): number {
  const at = time(iso);
  return at === undefined ? 0 : Math.max(0, Math.floor((now - at) / MINUTE));
}

/** How long someone has waited: calm, getting long, too long. */
export type WaitTone = "calm" | "warn" | "danger";

export function waitTone(minutes: number, warnAt: number, dangerAt: number): WaitTone {
  if (minutes >= dangerAt) return "danger";
  if (minutes >= warnAt) return "warn";
  return "calm";
}

/* ---------- Tables ---------- */

export const tableNumbers = (tables: Pick<Table, "id" | "number">[]) => new Map(tables.map((t) => [t.id, t.number]));

export type TableChoice = { table: Table; fits: boolean };

/**
 * Free tables to call or seat a party of `guests` at: tables that fit, smallest first (keep the
 * big ones for big parties), then the too-small ones (a host may still push two together).
 */
export function tableChoices(tables: Table[], guests: number): TableChoice[] {
  const free = tables.filter((t) => t.status === "FREE");
  const fits = free.filter((t) => t.seats >= guests).sort((a, b) => a.seats - b.seats || a.number - b.number);
  const small = free.filter((t) => t.seats < guests).sort((a, b) => b.seats - a.seats || a.number - b.number);
  return [...fits.map((table) => ({ table, fits: true })), ...small.map((table) => ({ table, fits: false }))];
}

export type FloorCount = { free: number; total: number };

export function floorCount(tables: Pick<Table, "status">[]): FloorCount {
  return { free: tables.filter((t) => t.status === "FREE").length, total: tables.length };
}

/* ---------- Waiter calls ---------- */

export const CALL_REASONS = ["order", "bill", "question", "other", "initial"] as const;
export type CallReason = (typeof CALL_REASONS)[number];
export const isCallReason = (reason: string): reason is CallReason => (CALL_REASONS as readonly string[]).includes(reason);

/** A waiting call goes amber after 3 minutes and red after 7. */
export const CALL_WARN_MIN = 3;
export const CALL_DANGER_MIN = 7;

export type CallBoard = { pending: WaiterCall[]; accepted: WaiterCall[]; doneToday: WaiterCall[] };

const byCreated = (a: { created_at?: string }, b: { created_at?: string }) =>
  (time(a.created_at) ?? 0) - (time(b.created_at) ?? 0);

/**
 * Calls of the venue: new ones first (oldest on top — they waited longest), then the ones someone
 * took, then today's finished ones (newest first). The API returns every call of the venue.
 */
export function callBoard(calls: WaiterCall[], now: number, timeZone = VENUE_TIME_ZONE): CallBoard {
  const today = dayKey(now, timeZone);
  return {
    pending: calls.filter((c) => c.status === "PENDING").sort(byCreated),
    accepted: calls.filter((c) => c.status === "ACCEPTED").sort(byCreated),
    doneToday: calls
      .filter((c) => c.status === "DONE" && c.created_at && dayKey(Date.parse(c.created_at), timeZone) === today)
      .sort((a, b) => byCreated(b, a)),
  };
}

/** Ids of calls in `next` that were not in `prev` and still wait — to flash them on arrival. */
export function newCallIds(prev: WaiterCall[] | null, next: WaiterCall[]): string[] {
  if (!prev) return [];
  const seen = new Set(prev.map((c) => c.id));
  return next.filter((c) => c.status === "PENDING" && !seen.has(c.id)).map((c) => c.id);
}

/* ---------- Orders ---------- */

/**
 * Where an order is on the floor:
 * scheduled — a preorder whose kitchen time has not come (the guest may still change it);
 * new — sent to the kitchen, nobody started; preparing; ready — to take to the table;
 * served — at the table, not paid yet; paid / cancelled — closed.
 */
export type OrderStage = "scheduled" | "new" | "preparing" | "ready" | "served" | "paid" | "cancelled" | "draft";

export function orderStage(order: Pick<Order, "status" | "preorder" | "kitchen_at" | "kitchen_due">, now: number): OrderStage {
  switch (order.status) {
    case "SUBMITTED": {
      const kitchenAt = time(order.kitchen_at);
      if (order.preorder && !order.kitchen_due && kitchenAt !== undefined && kitchenAt > now) return "scheduled";
      return "new";
    }
    case "PREPARING":
      return "preparing";
    case "READY":
      return "ready";
    case "SERVED":
      return "served";
    case "PAID":
      return "paid";
    case "CANCELLED":
      return "cancelled";
    default:
      return "draft";
  }
}

/** The one next step of each open stage (the API status it moves to). */
export const NEXT_STATUS: Partial<Record<OrderStage, "PREPARING" | "READY" | "SERVED" | "PAID">> = {
  new: "PREPARING",
  preparing: "READY",
  ready: "SERVED",
  served: "PAID",
};

/** Stages a waiter works with, in the order of service. */
export const OPEN_STAGES = ["new", "preparing", "ready", "served"] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];

/** 18+ lines of a preorder wait for an ID check in person; the API refuses SERVED / PAID until then. */
export const needsAgeCheck = (order: Pick<Order, "items">) => order.items.some((i) => i.age_check === "PENDING_AGE_CHECK");

/** New orders go amber after 10 minutes untouched and red after 20. */
export const ORDER_WARN_MIN = 10;
export const ORDER_DANGER_MIN = 20;

export type OrderBoard = Record<OpenStage, Order[]> & { scheduled: Order[]; closedToday: Order[] };

/**
 * The venue's orders by stage. The API returns every order of the venue, ever: only open ones,
 * preorders for later and today's closed ones are kept.
 */
export function orderBoard(orders: Order[], now: number, timeZone = VENUE_TIME_ZONE): OrderBoard {
  const today = dayKey(now, timeZone);
  const board: OrderBoard = { new: [], preparing: [], ready: [], served: [], scheduled: [], closedToday: [] };
  for (const order of orders) {
    const stage = orderStage(order, now);
    if (stage === "scheduled") board.scheduled.push(order);
    else if (stage === "paid" || stage === "cancelled") {
      const at = time(order.paid_at) ?? time(order.updated_at) ?? time(order.created_at);
      if (at !== undefined && dayKey(at, timeZone) === today) board.closedToday.push(order);
    } else if (stage !== "draft") board[stage].push(order);
  }
  for (const stage of OPEN_STAGES) board[stage].sort(byCreated);
  board.scheduled.sort((a, b) => (time(a.kitchen_at) ?? 0) - (time(b.kitchen_at) ?? 0));
  board.closedToday.sort((a, b) => (time(b.updated_at) ?? 0) - (time(a.updated_at) ?? 0));
  return board;
}

export const openOrderCount = (board: OrderBoard) => OPEN_STAGES.reduce((n, stage) => n + board[stage].length, 0);

/** Minutes the order sits in its current stage (since it was sent, or last moved). */
export function stageMinutes(order: Pick<Order, "status" | "created_at" | "updated_at">, now: number): number {
  return minutesSince(order.status === "SUBMITTED" ? order.created_at : order.updated_at || order.created_at, now);
}

/**
 * Table numbers of an order. The staff API does not send the table of an order yet (backend
 * task №52); it is found through a waiter call of the same table session or the booking of a
 * preorder.
 */
export function orderTables(
  order: Pick<Order, "session_id" | "reservation_id">,
  sessionTables: Map<string, string>,
  numbers: Map<string, number>,
  bookingTables: Map<string, number[]>,
): number[] {
  if (order.reservation_id) {
    const booked = bookingTables.get(order.reservation_id);
    if (booked?.length) return booked;
  }
  const tableId = order.session_id ? sessionTables.get(order.session_id) : undefined;
  const number = tableId ? numbers.get(tableId) : undefined;
  return number ? [number] : [];
}

/** Table session → table id, from the calls the venue received. */
export const sessionTables = (calls: WaiterCall[]) =>
  new Map(calls.filter((c) => c.session_id).map((c) => [c.session_id as string, c.table_id]));

/** Short label of an order: its check number, else the first characters of its id. */
export const orderLabel = (order: Pick<Order, "id" | "check_number">) =>
  order.check_number || order.id.replace(/^order-/, "").slice(0, 6).toUpperCase();

/* ---------- Waitlist ---------- */

/** A walk-in waits amber after 15 minutes and red after 30. */
export const QUEUE_WARN_MIN = 15;
export const QUEUE_DANGER_MIN = 30;
/** A called guest who has not come after 10 minutes is flagged. */
export const CALLED_LATE_MIN = 10;

export type QueueBoard = { ready: WaitlistEntry[]; waiting: WaitlistEntry[]; closed: WaitlistEntry[] };

/**
 * The host stand: guests already called to a table (oldest call first), then the queue in order
 * of arrival, then entries closed in the last hours (the API keeps 6 h), newest first.
 */
export function queueBoard(entries: WaitlistEntry[]): QueueBoard {
  const at = (e: WaitlistEntry, key: "created_at" | "notified_at" | "closed_at") => time(e[key]) ?? 0;
  return {
    ready: entries.filter((e) => e.status === "READY").sort((a, b) => at(a, "notified_at") - at(b, "notified_at")),
    waiting: entries.filter((e) => e.status === "WAITING").sort((a, b) => at(a, "created_at") - at(b, "created_at")),
    closed: entries
      .filter((e) => e.status !== "WAITING" && e.status !== "READY")
      .sort((a, b) => (at(b, "closed_at") || at(b, "created_at")) - (at(a, "closed_at") || at(a, "created_at"))),
  };
}

export const WAITLIST_MAX_GUESTS = 30;
export const WAITLIST_NAME_MAX = 60;
export const WAITLIST_NOTE_MAX = 140;

/** A Moldovan or international phone, loosely: digits, spaces, +, -, (), 6–15 digits. */
export function phoneProblem(value: string): "invalid" | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^[+\d\s()-]+$/.test(text)) return "invalid";
  const digits = text.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15 ? null : "invalid";
}

/** `tel:` link of a phone as typed. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/* ---------- Bookings ---------- */

const SOURCES: BookingSource[] = ["WEB", "ANDROID", "IOS", "PHONE", "WALK_IN"];

/**
 * Bookings of the venue as the staff API sends them (no guest name or email: that is the owner
 * list — backend task №53), in the shape the cabinet uses for booking states.
 */
export function staffBookings(rows: Reservation[], rules: VenueBookingRules, names: Map<string, string> = new Map()): CabinetBooking[] {
  const out: CabinetBooking[] = [];
  for (const row of rows) {
    const start = time(row.reserved_for);
    if (start === undefined) continue;
    const own = row.duration_min ?? 0;
    const durationMin = own > 0 ? own : rules.visitMin;
    const expectedArrival = time(row.expected_arrival);
    const from = expectedArrival && expectedArrival > start ? expectedArrival : start;
    out.push({
      id: row.id,
      venueId: row.venue_id,
      tableIds: row.table_ids?.length ? row.table_ids : row.table_id ? [row.table_id] : [],
      tableNumbers: row.table_numbers?.length ? row.table_numbers : row.table_number ? [row.table_number] : [],
      guestName: names.get(row.id)?.trim() ?? "",
      guestEmail: "",
      guests: row.guests,
      status: row.status,
      start,
      end: from + durationMin * MINUTE,
      durationMin,
      durationKnown: own > 0,
      notes: (row.notes ?? "").trim(),
      source: row.source && SOURCES.includes(row.source) ? row.source : undefined,
      arrivalConfirmedAt: time(row.arrival_confirmed_at),
      expectedArrival,
      createdAt: time(row.created_at),
      preorder: row.preorder,
    });
  }
  return out;
}

/** Bookings of a venue day, by time. */
export function bookingsOfDay(list: CabinetBooking[], day: string, timeZone = VENUE_TIME_ZONE): CabinetBooking[] {
  return list.filter((b) => dayKey(b.start, timeZone) === day).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/** Reservation id → its table numbers, to place preorders on the floor. */
export const bookingTables = (list: CabinetBooking[]) => new Map(list.map((b) => [b.id, b.tableNumbers]));

/* ---------- The person's shift ---------- */

export type MyShift = {
  /** A shift running now (not declined). */
  current?: WorkShift;
  /** The next shift that has not started (not declined). */
  next?: WorkShift;
};

/** The shift the person is on now and the next one, optionally at one venue. */
export function myShift(shifts: WorkShift[], now: number, venueId?: string): MyShift {
  let current: { shift: WorkShift; end: number } | undefined;
  let next: { shift: WorkShift; start: number } | undefined;
  for (const shift of shifts) {
    if (shift.status === "DECLINED") continue;
    if (venueId && shift.venue_id !== venueId) continue;
    const span = shiftSpan(shift);
    if (!span) continue;
    if (span.start <= now && now < span.end) {
      if (!current || span.end > current.end) current = { shift, end: span.end };
    } else if (span.start > now && (!next || span.start < next.start)) {
      next = { shift, start: span.start };
    }
  }
  return { current: current?.shift, next: next?.shift };
}

/**
 * Venues the person works at, known from their shifts (the API has no list of a staff member's
 * venues yet — backend task №36): venues with a shift today or later first, by the nearest shift.
 */
export function shiftVenueIds(shifts: WorkShift[], now: number): string[] {
  const nearest = new Map<string, number>();
  for (const shift of shifts) {
    const span = shiftSpan(shift);
    const end = span?.end ?? 0;
    // Upcoming shifts rank by start; past ones after all upcoming, most recent first.
    const rank = end > now ? (span?.start ?? 0) : Number.MAX_SAFE_INTEGER - end;
    const prev = nearest.get(shift.venue_id);
    if (prev === undefined || rank < prev) nearest.set(shift.venue_id, rank);
  }
  return [...nearest.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/* ---------- Panel tabs ---------- */

export const STAFF_TABS = ["calls", "orders", "waitlist", "bookings", "shifts"] as const;
export type StaffTab = (typeof STAFF_TABS)[number];
export const isStaffTab = (value: string | null | undefined): value is StaffTab =>
  (STAFF_TABS as readonly string[]).includes(value ?? "");
