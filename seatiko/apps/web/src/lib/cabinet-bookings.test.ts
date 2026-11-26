import { describe, expect, it } from "vitest";
import type { Reservation, RestaurantReservation } from "./api";
import {
  addDays,
  bookingState,
  dayKey,
  dayStart,
  dayTotals,
  daysBetween,
  expectedAt,
  filterBookings,
  formatClock,
  formatDay,
  formatDuration,
  groupByDay,
  isPast,
  isSeatedNow,
  isUpcoming,
  matchesQuery,
  mergeBookings,
  minutesIntoDay,
  nextArrival,
  nowMarker,
  periodCounts,
  timelineRows,
  timelineWindow,
  upcomingOwnerBookings,
  venueRules,
  type BookingFilters,
  type CabinetBooking,
} from "./cabinet-bookings";

const MIN = 60_000;
// 26 Nov 2026, 18:00 in Chișinău (UTC+2 in winter).
const NOW = Date.parse("2026-11-26T16:00:00Z");

function owner(id: string, at: string, extra: Partial<RestaurantReservation> = {}): RestaurantReservation {
  return {
    id,
    venue_id: "venue-1",
    venue_name: { ru: "", en: "", ro: "" },
    table_id: `t-${id}`,
    table_number: 1,
    guest_name: "Ирина Ковальчук",
    guest_email: "irina@example.md",
    guests: 2,
    reserved_for: at,
    status: "CONFIRMED",
    created_at: "2026-11-20T10:00:00Z",
    ...extra,
  };
}

function booking(id: string, at: string, extra: Partial<CabinetBooking> = {}): CabinetBooking {
  const start = Date.parse(at);
  return {
    id,
    venueId: "venue-1",
    tableIds: [`t-${id}`],
    tableNumbers: [1],
    guestName: "Гость",
    guestEmail: "",
    guests: 2,
    status: "CONFIRMED",
    start,
    end: start + 90 * MIN,
    durationMin: 90,
    durationKnown: true,
    notes: "",
    ...extra,
  };
}

const allFilters: BookingFilters = { period: "all", status: "all", table: "all", query: "" };

describe("venueRules", () => {
  it("falls back to the API defaults for empty rules", () => {
    expect(venueRules(null)).toEqual({ visitMin: 90, holdMin: 15 });
    expect(venueRules({ visit_duration_min: 0, hold_minutes: 0 })).toEqual({ visitMin: 90, holdMin: 0 });
    expect(venueRules({ visit_duration_min: 120, hold_minutes: 20 })).toEqual({ visitMin: 120, holdMin: 20 });
  });
});

describe("mergeBookings", () => {
  const rules = { visitMin: 90, holdMin: 15 };

  it("adds duration, notes, tables and source from the venue panel list", () => {
    const details = [
      {
        id: "a",
        table_ids: ["t1", "t2"],
        table_numbers: [3, 4],
        duration_min: 120,
        notes: "  Детский стул ",
        source: "PHONE",
      } as Reservation,
    ];
    const [merged] = mergeBookings([owner("a", "2026-11-26T17:00:00Z")], details, rules);
    expect(merged.tableIds).toEqual(["t1", "t2"]);
    expect(merged.tableNumbers).toEqual([3, 4]);
    expect(merged.durationMin).toBe(120);
    expect(merged.durationKnown).toBe(true);
    expect(merged.end - merged.start).toBe(120 * MIN);
    expect(merged.notes).toBe("Детский стул");
    expect(merged.source).toBe("PHONE");
  });

  it("uses the venue default duration when the details are missing", () => {
    const [merged] = mergeBookings([owner("a", "2026-11-26T17:00:00Z")], null, { visitMin: 60, holdMin: 15 });
    expect(merged.durationMin).toBe(60);
    expect(merged.durationKnown).toBe(false);
    expect(merged.tableNumbers).toEqual([1]);
    expect(merged.tableIds).toEqual(["t-a"]);
  });

  it("moves the end by an announced late arrival, like the API's booking window", () => {
    const details = [{ id: "a", duration_min: 90, expected_arrival: "2026-11-26T17:20:00Z" } as Reservation];
    const [merged] = mergeBookings([owner("a", "2026-11-26T17:00:00Z")], details, rules);
    expect(new Date(merged.end).toISOString()).toBe("2026-11-26T18:50:00.000Z");
  });

  it("skips rows with an unreadable time and unknown sources", () => {
    const details = [{ id: "b", source: "FAX" } as unknown as Reservation];
    const merged = mergeBookings([owner("a", "not a date"), owner("b", "2026-11-26T17:00:00Z")], details, rules);
    expect(merged.map((b) => b.id)).toEqual(["b"]);
    expect(merged[0].source).toBeUndefined();
  });
});

describe("venue days", () => {
  it("keys days in the venue zone, not UTC", () => {
    // 23:30 UTC on the 26th is already the 27th in Chișinău.
    expect(dayKey(Date.parse("2026-11-26T23:30:00Z"))).toBe("2026-11-27");
    expect(dayKey(Date.parse("2026-11-26T21:59:00Z"))).toBe("2026-11-26");
  });

  it("finds venue midnight across DST changes", () => {
    expect(new Date(dayStart("2026-11-26")).toISOString()).toBe("2026-11-25T22:00:00.000Z");
    expect(new Date(dayStart("2026-07-01")).toISOString()).toBe("2026-06-30T21:00:00.000Z");
    // Moldova springs forward on 29 March 2026: that day starts at UTC+2.
    expect(new Date(dayStart("2026-03-29")).toISOString()).toBe("2026-03-28T22:00:00.000Z");
  });

  it("adds days across months and counts the gap", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-26", "2026-12-01")).toBe(5);
  });

  it("measures minutes from venue midnight", () => {
    expect(minutesIntoDay(Date.parse("2026-11-26T17:30:00Z"), "2026-11-26")).toBe(19 * 60 + 30);
    expect(minutesIntoDay(Date.parse("2026-11-26T22:30:00Z"), "2026-11-26")).toBe(24 * 60 + 30);
  });

  it("formats clock and day in the venue zone", () => {
    expect(formatClock(Date.parse("2026-11-26T17:05:00Z"))).toBe("19:05");
    expect(formatDay("2026-11-26", "ru")).toBe("чт, 26 ноября");
    expect(formatDay("2026-11-26", "en")).toBe("Thu 26 November");
    expect(formatDay("2026-11-26", "ro")).toBe("joi, 26 noiembrie");
  });
});

describe("bookingState", () => {
  const at = "2026-11-26T16:00:00Z";
  it("follows a confirmed booking through the hold time", () => {
    const b = booking("a", at);
    expect(bookingState(b, NOW - MIN, 15)).toBe("confirmed");
    expect(bookingState(b, NOW + 10 * MIN, 15)).toBe("late");
    expect(bookingState(b, NOW + 15 * MIN, 15)).toBe("not_marked");
    expect(bookingState(b, NOW + 10 * MIN, 0)).toBe("not_marked");
  });

  it("tells a confirmed arrival, an announced late arrival and a guest at the table apart", () => {
    const checked = booking("a", at, { status: "CHECKED_IN", arrivalConfirmedAt: NOW - 60 * MIN });
    expect(bookingState(checked, NOW - 30 * MIN, 15)).toBe("arrival_confirmed");
    expect(bookingState(checked, NOW + MIN, 15)).toBe("arrived");
    // Checked in by QR before the booked time: already at the table.
    const early = booking("q", at, { status: "CHECKED_IN" });
    expect(bookingState(early, NOW - 20 * MIN, 15)).toBe("arrived");
    expect(isSeatedNow(early, NOW - 20 * MIN)).toBe(true);
    const late = booking("b", at, { status: "CHECKED_IN", expectedArrival: NOW + 20 * MIN });
    expect(bookingState(late, NOW + 5 * MIN, 15)).toBe("due");
    expect(bookingState(late, NOW + 25 * MIN, 15)).toBe("arrived");
  });

  it("keeps cancellations and no-shows as they are", () => {
    expect(bookingState(booking("a", at, { status: "CANCELLED" }), NOW, 15)).toBe("cancelled");
    expect(bookingState(booking("a", at, { status: "NO_SHOW" }), NOW, 15)).toBe("no_show");
  });

  it("counts only checked-in visits in progress as seated", () => {
    const seated = booking("a", "2026-11-26T15:30:00Z", { status: "CHECKED_IN" });
    expect(isSeatedNow(seated, NOW)).toBe(true);
    expect(isSeatedNow(seated, NOW + 2 * 60 * MIN)).toBe(false);
    expect(isSeatedNow(booking("b", "2026-11-26T15:30:00Z"), NOW)).toBe(false);
  });
});

describe("upcoming and past", () => {
  it("keeps a visit in progress upcoming until it ends", () => {
    const running = booking("a", "2026-11-26T15:30:00Z", { status: "CHECKED_IN" });
    expect(isUpcoming(running, NOW)).toBe(true);
    expect(isPast(running, NOW)).toBe(false);
    expect(isPast(running, NOW + 60 * MIN)).toBe(true);
  });

  it("puts cancellations in the past only once their time has come", () => {
    const future = booking("a", "2026-11-27T16:00:00Z", { status: "CANCELLED" });
    expect(isUpcoming(future, NOW)).toBe(false);
    expect(isPast(future, NOW)).toBe(false);
    const gone = booking("b", "2026-11-25T16:00:00Z", { status: "NO_SHOW" });
    expect(isPast(gone, NOW)).toBe(true);
  });

  it("counts the owner list for the badge with the default visit length", () => {
    const rows = [
      owner("late", "2026-11-28T18:00:00Z"),
      owner("running", "2026-11-26T15:00:00Z", { status: "CHECKED_IN" }),
      owner("over", "2026-11-26T14:00:00Z"),
      owner("cancelled", "2026-11-27T19:00:00Z", { status: "CANCELLED" }),
    ];
    expect(upcomingOwnerBookings(rows, NOW).map((r) => r.id)).toEqual(["running", "late"]);
  });
});

describe("filterBookings", () => {
  const list = [
    booking("tonight", "2026-11-26T17:30:00Z", { guestName: "Ana Ciobanu", tableIds: ["t5"], tableNumbers: [5] }),
    booking("seated", "2026-11-26T15:30:00Z", { status: "CHECKED_IN", guestName: "Олег" }),
    booking("lunch", "2026-11-26T10:00:00Z", { status: "CHECKED_IN" }),
    booking("tomorrow", "2026-11-27T17:00:00Z", { notes: "Торт на день рождения" }),
    booking("cancel-tomorrow", "2026-11-27T18:00:00Z", { status: "CANCELLED" }),
    booking("last-week", "2026-11-19T17:00:00Z", { status: "NO_SHOW" }),
    // 00:30 on the 27th in Chișinău, still the 26th in UTC.
    booking("after-midnight", "2026-11-26T22:30:00Z"),
  ];

  it("shows a venue day in time order with every status", () => {
    const today = filterBookings(list, { ...allFilters, period: "today" }, NOW).map((b) => b.id);
    expect(today).toEqual(["lunch", "seated", "tonight"]);
    const tomorrow = filterBookings(list, { ...allFilters, period: "tomorrow" }, NOW).map((b) => b.id);
    expect(tomorrow).toEqual(["after-midnight", "tomorrow", "cancel-tomorrow"]);
    const day = filterBookings(list, { ...allFilters, period: "day", day: "2026-11-19" }, NOW).map((b) => b.id);
    expect(day).toEqual(["last-week"]);
  });

  it("lists upcoming soonest first and past newest first", () => {
    expect(filterBookings(list, { ...allFilters, period: "upcoming" }, NOW).map((b) => b.id)).toEqual([
      "seated",
      "tonight",
      "after-midnight",
      "tomorrow",
    ]);
    expect(filterBookings(list, { ...allFilters, period: "past" }, NOW).map((b) => b.id)).toEqual([
      "lunch",
      "last-week",
    ]);
  });

  it("filters by status, table and search", () => {
    expect(filterBookings(list, { ...allFilters, status: "active" }, NOW)).toHaveLength(5);
    expect(filterBookings(list, { ...allFilters, status: "CANCELLED" }, NOW).map((b) => b.id)).toEqual([
      "cancel-tomorrow",
    ]);
    expect(filterBookings(list, { ...allFilters, table: "t5" }, NOW).map((b) => b.id)).toEqual(["tonight"]);
    expect(filterBookings(list, { ...allFilters, query: "ciob" }, NOW).map((b) => b.id)).toEqual(["tonight"]);
    expect(filterBookings(list, { ...allFilters, query: "торт" }, NOW).map((b) => b.id)).toEqual(["tomorrow"]);
  });

  it("counts every quick filter", () => {
    expect(periodCounts(list, NOW)).toEqual({ today: 3, tomorrow: 3, upcoming: 4, past: 2, all: 7 });
  });
});

describe("matchesQuery", () => {
  const b = booking("a", "2026-11-26T17:00:00Z", {
    guestName: "Ștefan Plăcintă",
    guestEmail: "stefan@example.md",
    tableNumbers: [12],
    notes: "Ёлка у окна",
  });
  it("ignores case and diacritics", () => {
    expect(matchesQuery(b, "stefan placinta")).toBe(true);
    expect(matchesQuery(b, "ЕЛКА")).toBe(true);
    expect(matchesQuery(b, "example.md")).toBe(true);
    expect(matchesQuery(b, "maria")).toBe(false);
  });
  it("finds a table by number", () => {
    expect(matchesQuery(b, "12")).toBe(true);
    expect(matchesQuery(b, "№12")).toBe(true);
    expect(matchesQuery(b, "стол 12")).toBe(false); // "стол" is not in the booking text
    expect(matchesQuery(b, "13")).toBe(false);
  });
});

describe("groupByDay and totals", () => {
  const list = [
    booking("b", "2026-11-26T18:00:00Z", { guests: 4 }),
    booking("a", "2026-11-26T16:00:00Z", { guests: 2 }),
    booking("c", "2026-11-26T19:00:00Z", { guests: 6, status: "CANCELLED" }),
    booking("d", "2026-11-25T16:00:00Z", { guests: 3 }),
  ];
  it("groups by venue day with bookings by time inside each day", () => {
    const groups = groupByDay(list, "desc");
    expect(groups.map((g) => g.day)).toEqual(["2026-11-26", "2026-11-25"]);
    expect(groups[0].bookings.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(groups[0].totals).toEqual({ bookings: 2, covers: 6, cancelled: 1 });
    expect(groupByDay(list, "asc")[0].day).toBe("2026-11-25");
  });
  it("leaves cancellations out of the covers", () => {
    expect(dayTotals([])).toEqual({ bookings: 0, covers: 0, cancelled: 0 });
  });
  it("finds the next expected guest", () => {
    expect(nextArrival(list, NOW)?.id).toBe("b");
    expect(nextArrival(list, NOW + 5 * 60 * MIN)).toBeUndefined();
  });
  it("counts guests who confirmed or announced a late arrival as expected, not those seated", () => {
    const coming = booking("coming", "2026-11-26T17:00:00Z", { status: "CHECKED_IN", arrivalConfirmedAt: NOW });
    const seatedEarly = booking("seated", "2026-11-26T16:30:00Z", { status: "CHECKED_IN" });
    const due = booking("due", "2026-11-26T15:50:00Z", {
      status: "CHECKED_IN",
      arrivalConfirmedAt: NOW - 30 * MIN,
      expectedArrival: NOW + 10 * MIN,
    });
    expect(nextArrival([coming, seatedEarly, due], NOW)?.id).toBe("due");
    expect(expectedAt(due)).toBe(NOW + 10 * MIN);
    expect(nextArrival([coming, seatedEarly], NOW)?.id).toBe("coming");
  });
});

describe("timeline", () => {
  const day = "2026-11-26";
  const list = [
    booking("evening", "2026-11-26T17:00:00Z", { tableIds: ["t2"], tableNumbers: [2] }),
    booking("pair", "2026-11-26T12:00:00Z", { tableIds: ["t1", "t3"], tableNumbers: [1, 3] }),
    booking("cancelled", "2026-11-26T14:00:00Z", { tableIds: ["t1"], status: "CANCELLED" }),
    booking("late-night", "2026-11-26T21:30:00Z", { tableIds: ["t9"], tableNumbers: [9] }),
  ];
  const tables = [
    { id: "t3", number: 3, seats: 4 },
    { id: "t1", number: 1, seats: 2 },
    { id: "t2", number: 2, seats: 6 },
  ];

  it("widens the 10:00–23:00 window to fit the day's bookings", () => {
    expect(timelineWindow([], day)).toEqual({ startMin: 600, endMin: 1380 });
    expect(timelineWindow(list, day)).toEqual({ startMin: 600, endMin: 1440 });
    const breakfast = [booking("x", "2026-11-26T06:15:00Z")];
    expect(timelineWindow(breakfast, day).startMin).toBe(8 * 60);
  });

  it("puts each active booking on every table it holds", () => {
    const window = { startMin: 600, endMin: 1440 };
    const rows = timelineRows(list, tables, day, window);
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 9]);
    expect(rows[0].blocks.map((b) => b.booking.id)).toEqual(["pair"]);
    expect(rows[2].blocks.map((b) => b.booking.id)).toEqual(["pair"]);
    const evening = rows[1].blocks[0];
    expect(evening.left).toBeCloseTo((9 * 60 / 840) * 100);
    expect(evening.width).toBeCloseTo((90 / 840) * 100);
    const night = rows[3].blocks[0];
    expect(night.clippedEnd).toBe(true);
  });

  it("marks now only inside the window", () => {
    const window = { startMin: 600, endMin: 1380 };
    expect(nowMarker(NOW, day, window)).toBeCloseTo((8 * 60 / 780) * 100);
    expect(nowMarker(NOW, "2026-11-27", window)).toBeNull();
  });
});

describe("formatDuration", () => {
  const ru = { hours: "{h} ч", minutes: "{m} мин", hoursMinutes: "{h} ч {m} мин" };
  it("writes hours and minutes", () => {
    expect(formatDuration(90, ru)).toBe("1 ч 30 мин");
    expect(formatDuration(120, ru)).toBe("2 ч");
    expect(formatDuration(45, ru)).toBe("45 мин");
  });
});
