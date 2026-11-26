import { describe, expect, it } from "vitest";
import type { Order, Reservation, Table, WaiterCall, WaitlistEntry, WorkShift } from "@/lib/api";
import {
  bookingsOfDay,
  callBoard,
  floorCount,
  isStaffTab,
  minutesSince,
  myShift,
  needsAgeCheck,
  newCallIds,
  NEXT_STATUS,
  openOrderCount,
  orderBoard,
  orderLabel,
  orderStage,
  orderTables,
  phoneProblem,
  queueBoard,
  sessionTables,
  shiftVenueIds,
  stageMinutes,
  staffBookings,
  tableChoices,
  tableNumbers,
  telHref,
  waitTone,
} from "@/lib/staff-floor";

// 26 Nov 2026, 19:00 in Chisinau (UTC+2).
const NOW = Date.parse("2026-11-26T17:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const call = (over: Partial<WaiterCall>): WaiterCall => ({
  id: "c",
  table_id: "t1",
  reason: "bill",
  status: "PENDING",
  created_at: iso(1),
  ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: "order-abc123456",
  session_id: "s1",
  user_id: "u1",
  venue_id: "v1",
  items: [],
  status: "SUBMITTED",
  total: 100,
  created_at: iso(5),
  updated_at: iso(5),
  ...over,
});

const table = (over: Partial<Table>): Table => ({
  id: "t",
  venue_id: "v1",
  number: 1,
  seats: 2,
  status: "FREE",
  x: 0,
  y: 0,
  ...over,
});

const shift = (over: Partial<WorkShift>): WorkShift => ({
  id: "sh",
  venue_id: "v1",
  staff_id: "m1",
  staff_name: "Анна",
  role: "waiter",
  date: "2026-11-26",
  start_time: "10:00",
  end_time: "22:00",
  status: "CONFIRMED",
  created_at: iso(1000),
  updated_at: iso(1000),
  ...over,
});

describe("minutesSince / waitTone", () => {
  it("counts whole minutes and never goes negative", () => {
    expect(minutesSince(iso(4.9), NOW)).toBe(4);
    expect(minutesSince(new Date(NOW + 60_000).toISOString(), NOW)).toBe(0);
    expect(minutesSince("nonsense", NOW)).toBe(0);
    expect(minutesSince(undefined, NOW)).toBe(0);
  });

  it("turns amber, then red", () => {
    expect(waitTone(2, 3, 7)).toBe("calm");
    expect(waitTone(3, 3, 7)).toBe("warn");
    expect(waitTone(7, 3, 7)).toBe("danger");
  });
});

describe("callBoard", () => {
  it("splits calls and keeps only today's finished ones", () => {
    const board = callBoard(
      [
        call({ id: "new-late", created_at: iso(1) }),
        call({ id: "new-early", created_at: iso(9) }),
        call({ id: "taken", status: "ACCEPTED", created_at: iso(4) }),
        call({ id: "done-today", status: "DONE", created_at: iso(60) }),
        call({ id: "done-yesterday", status: "DONE", created_at: "2026-11-25T12:00:00Z" }),
      ],
      NOW,
    );
    expect(board.pending.map((c) => c.id)).toEqual(["new-early", "new-late"]);
    expect(board.accepted.map((c) => c.id)).toEqual(["taken"]);
    expect(board.doneToday.map((c) => c.id)).toEqual(["done-today"]);
  });

  it("uses the venue day, not UTC: 00:30 Chisinau is the next day", () => {
    const lateNight = Date.parse("2026-11-26T22:30:00Z"); // 27 Nov 00:30 in Chisinau
    const board = callBoard([call({ id: "x", status: "DONE", created_at: "2026-11-26T21:50:00Z" })], lateNight);
    expect(board.doneToday).toHaveLength(0);
  });

  it("flags only calls that appeared since the last poll", () => {
    const prev = [call({ id: "a" })];
    const next = [call({ id: "a" }), call({ id: "b" }), call({ id: "c", status: "ACCEPTED" })];
    expect(newCallIds(prev, next)).toEqual(["b"]);
    expect(newCallIds(null, next)).toEqual([]);
  });
});

describe("orderStage", () => {
  it("maps API statuses to floor stages", () => {
    expect(orderStage(order({ status: "SUBMITTED" }), NOW)).toBe("new");
    expect(orderStage(order({ status: "PREPARING" }), NOW)).toBe("preparing");
    expect(orderStage(order({ status: "READY" }), NOW)).toBe("ready");
    expect(orderStage(order({ status: "SERVED" }), NOW)).toBe("served");
    expect(orderStage(order({ status: "PAID" }), NOW)).toBe("paid");
    expect(orderStage(order({ status: "CANCELLED" }), NOW)).toBe("cancelled");
    expect(orderStage(order({ status: "DRAFT" }), NOW)).toBe("draft");
  });

  it("keeps a preorder aside until its kitchen time", () => {
    const later = new Date(NOW + 30 * 60_000).toISOString();
    expect(orderStage(order({ preorder: true, kitchen_at: later }), NOW)).toBe("scheduled");
    expect(orderStage(order({ preorder: true, kitchen_at: later, kitchen_due: true }), NOW)).toBe("new");
    expect(orderStage(order({ preorder: true, kitchen_at: iso(1) }), NOW)).toBe("new");
  });

  it("only moves forward, one step at a time", () => {
    expect(NEXT_STATUS.new).toBe("PREPARING");
    expect(NEXT_STATUS.preparing).toBe("READY");
    expect(NEXT_STATUS.ready).toBe("SERVED");
    expect(NEXT_STATUS.served).toBe("PAID");
    expect(NEXT_STATUS.scheduled).toBeUndefined();
    expect(NEXT_STATUS.paid).toBeUndefined();
  });
});

describe("orderBoard", () => {
  it("drops old closed orders and drafts, sorts by waiting time", () => {
    const board = orderBoard(
      [
        order({ id: "n2", created_at: iso(2) }),
        order({ id: "n1", created_at: iso(12) }),
        order({ id: "p", status: "PREPARING" }),
        order({ id: "r", status: "READY" }),
        order({ id: "s", status: "SERVED" }),
        order({ id: "paid-today", status: "PAID", paid_at: iso(30), updated_at: iso(30) }),
        order({ id: "paid-old", status: "PAID", paid_at: "2026-11-20T12:00:00Z", updated_at: "2026-11-20T12:00:00Z" }),
        order({ id: "cancel-today", status: "CANCELLED", updated_at: iso(10) }),
        order({ id: "draft", status: "DRAFT" }),
        order({ id: "pre", preorder: true, kitchen_at: new Date(NOW + 3_600_000).toISOString() }),
      ],
      NOW,
    );
    expect(board.new.map((o) => o.id)).toEqual(["n1", "n2"]);
    expect(board.preparing.map((o) => o.id)).toEqual(["p"]);
    expect(board.ready.map((o) => o.id)).toEqual(["r"]);
    expect(board.served.map((o) => o.id)).toEqual(["s"]);
    expect(board.scheduled.map((o) => o.id)).toEqual(["pre"]);
    expect(board.closedToday.map((o) => o.id)).toEqual(["cancel-today", "paid-today"]);
    expect(openOrderCount(board)).toBe(5);
  });

  it("measures time in the current stage", () => {
    expect(stageMinutes(order({ status: "SUBMITTED", created_at: iso(8), updated_at: iso(1) }), NOW)).toBe(8);
    expect(stageMinutes(order({ status: "PREPARING", created_at: iso(8), updated_at: iso(3) }), NOW)).toBe(3);
  });

  it("knows when an ID check blocks serving", () => {
    const item = { menu_item_id: "w", name: { ru: "Вино", en: "Wine", ro: "Vin" }, qty: 1, price: 90 };
    expect(needsAgeCheck(order({ items: [{ ...item, age_check: "PENDING_AGE_CHECK" }] }))).toBe(true);
    expect(needsAgeCheck(order({ items: [{ ...item, age_check: "CONFIRMED" }] }))).toBe(false);
    expect(needsAgeCheck(order({ items: [item] }))).toBe(false);
  });

  it("labels an order by its check number, else a short id", () => {
    expect(orderLabel({ id: "order-demo-v1-1", check_number: "CHK-1042" })).toBe("CHK-1042");
    expect(orderLabel({ id: "order-abc123456" })).toBe("ABC123");
  });
});

describe("orderTables", () => {
  it("finds the table through a call of the same session or the preorder's booking", () => {
    const sessions = sessionTables([call({ session_id: "s1", table_id: "t3" }), call({ table_id: "t9" })]);
    const numbers = tableNumbers([table({ id: "t3", number: 3 })]);
    const booked = new Map([["r1", [5, 6]]]);
    expect(orderTables({ session_id: "s1" }, sessions, numbers, booked)).toEqual([3]);
    expect(orderTables({ session_id: "s2" }, sessions, numbers, booked)).toEqual([]);
    expect(orderTables({ session_id: "", reservation_id: "r1" }, sessions, numbers, booked)).toEqual([5, 6]);
  });
});

describe("tables", () => {
  it("offers fitting free tables smallest first, then too-small ones", () => {
    const list = [
      table({ id: "a", number: 1, seats: 6 }),
      table({ id: "b", number: 2, seats: 4 }),
      table({ id: "c", number: 3, seats: 2 }),
      table({ id: "d", number: 4, seats: 4, status: "OCCUPIED" }),
      table({ id: "e", number: 5, seats: 3 }),
    ];
    const choices = tableChoices(list, 4);
    expect(choices.map((c) => [c.table.number, c.fits])).toEqual([
      [2, true],
      [1, true],
      [5, false],
      [3, false],
    ]);
    expect(floorCount(list)).toEqual({ free: 4, total: 5 });
  });
});

describe("queueBoard", () => {
  const entry = (over: Partial<WaitlistEntry>): WaitlistEntry => ({
    id: "w",
    venue_id: "v1",
    guest_name: "Ион",
    guests: 2,
    status: "WAITING",
    source: "HOST",
    created_at: iso(10),
    ...over,
  });

  it("puts called guests first, the queue by arrival, closed newest first", () => {
    const board = queueBoard([
      entry({ id: "w2", created_at: iso(5) }),
      entry({ id: "w1", created_at: iso(20) }),
      entry({ id: "ready", status: "READY", notified_at: iso(2) }),
      entry({ id: "left", status: "LEFT", closed_at: iso(30) }),
      entry({ id: "seated", status: "SEATED", closed_at: iso(3) }),
    ]);
    expect(board.ready.map((e) => e.id)).toEqual(["ready"]);
    expect(board.waiting.map((e) => e.id)).toEqual(["w1", "w2"]);
    expect(board.closed.map((e) => e.id)).toEqual(["seated", "left"]);
  });

  it("checks phones loosely and builds tel links", () => {
    expect(phoneProblem("")).toBeNull();
    expect(phoneProblem("+373 68 555 444")).toBeNull();
    expect(phoneProblem("068-555-444")).toBeNull();
    expect(phoneProblem("12")).toBe("invalid");
    expect(phoneProblem("call me")).toBe("invalid");
    expect(telHref("+373 (68) 555-444")).toBe("tel:+37368555444");
  });
});

describe("staffBookings", () => {
  const row = (over: Partial<Reservation>): Reservation => ({
    id: "r",
    user_id: "u",
    venue_id: "v1",
    table_id: "t5",
    guests: 2,
    reserved_for: "2026-11-26T18:00:00Z",
    status: "CONFIRMED",
    created_at: iso(500),
    ...over,
  });

  it("uses the venue default length, own tables and names when known", () => {
    const [b] = staffBookings([row({ table_number: 5 })], { visitMin: 90, holdMin: 15 }, new Map([["r", " Ана "]]));
    expect(b.durationMin).toBe(90);
    expect(b.durationKnown).toBe(false);
    expect(b.tableNumbers).toEqual([5]);
    expect(b.guestName).toBe("Ана");
    expect(b.end - b.start).toBe(90 * 60_000);
  });

  it("keeps only the venue day, by time", () => {
    const list = staffBookings(
      [
        row({ id: "late", reserved_for: "2026-11-26T19:00:00Z" }),
        row({ id: "early", reserved_for: "2026-11-26T08:00:00Z" }),
        row({ id: "after-midnight", reserved_for: "2026-11-26T22:30:00Z" }),
      ],
      { visitMin: 90, holdMin: 15 },
    );
    expect(bookingsOfDay(list, "2026-11-26").map((b) => b.id)).toEqual(["early", "late"]);
    expect(bookingsOfDay(list, "2026-11-27").map((b) => b.id)).toEqual(["after-midnight"]);
  });
});

describe("myShift / shiftVenueIds", () => {
  it("finds the running shift and the next one", () => {
    const shifts = [
      shift({ id: "now", date: "2026-11-26", start_time: "10:00", end_time: "22:00" }),
      shift({ id: "tomorrow", date: "2026-11-27" }),
      shift({ id: "declined", date: "2026-11-26", start_time: "20:00", end_time: "23:00", status: "DECLINED" }),
    ];
    expect(myShift(shifts, NOW)).toMatchObject({ current: { id: "now" }, next: { id: "tomorrow" } });
    expect(myShift(shifts, NOW, "other")).toEqual({ current: undefined, next: undefined });
  });

  it("counts a night shift as running after midnight", () => {
    const night = shift({ id: "night", date: "2026-11-26", start_time: "22:00", end_time: "04:00" });
    const at0130 = Date.parse("2026-11-26T23:30:00Z");
    expect(myShift([night], at0130).current?.id).toBe("night");
  });

  it("orders venues by the nearest upcoming shift, past ones last", () => {
    const ids = shiftVenueIds(
      [
        shift({ venue_id: "past", date: "2026-11-01" }),
        shift({ venue_id: "later", date: "2026-12-05" }),
        shift({ venue_id: "soon", date: "2026-11-27" }),
        shift({ venue_id: "soon", date: "2026-11-30" }),
      ],
      NOW,
    );
    expect(ids).toEqual(["soon", "later", "past"]);
  });

  it("recognises panel tabs", () => {
    expect(isStaffTab("orders")).toBe(true);
    expect(isStaffTab("overview")).toBe(false);
    expect(isStaffTab(null)).toBe(false);
  });
});
