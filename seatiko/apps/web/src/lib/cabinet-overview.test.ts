import { describe, expect, it } from "vitest";
import type { ProfileChangeRequest, StaffMember, VenueRole, WorkShift } from "./api";
import type { CabinetBooking } from "./cabinet-bookings";
import {
  attentionItems,
  changeState,
  hallNow,
  launchStage,
  shiftPhase,
  shiftProblems,
  teamDay,
  todaySummary,
  venueSetup,
  venuesToday,
  type AttentionInput,
} from "./cabinet-overview";

const MIN = 60_000;
// 26 Nov 2026, 18:00 in Chișinău (UTC+2 in winter).
const NOW = Date.parse("2026-11-26T16:00:00Z");

function booking(id: string, at: string, extra: Partial<CabinetBooking> = {}): CabinetBooking {
  const start = Date.parse(at);
  return {
    id,
    venueId: "venue-1",
    tableIds: [`t-${id}`],
    tableNumbers: [1],
    guestName: `Guest ${id}`,
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

function shift(id: string, extra: Partial<WorkShift> = {}): WorkShift {
  return {
    id,
    venue_id: "venue-1",
    staff_id: `s-${id}`,
    staff_name: `Staff ${id}`,
    role: "waiter",
    date: "2026-11-26",
    start_time: "10:00",
    end_time: "22:00",
    status: "CONFIRMED",
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

function member(id: string, role: string, status = "ACTIVE"): StaffMember {
  return { id, venue_id: "venue-1", email: `${id}@x.md`, role, status, created_at: "" };
}

function role(key: string, extra: Partial<VenueRole> = {}): VenueRole {
  return {
    id: key,
    venue_id: "venue-1",
    key,
    name: "",
    color: "#000",
    in_schedule: true,
    position: 0,
    is_system: true,
    permissions: [],
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("todaySummary", () => {
  it("counts today and tomorrow by the venue day, not UTC", () => {
    const list = [
      booking("a", "2026-11-26T15:00:00Z", { guests: 4 }),
      // 23:30 venue time is still today, though it is 21:30 UTC.
      booking("b", "2026-11-26T21:30:00Z", { guests: 3 }),
      // 00:30 venue time on the 27th is 22:30 UTC on the 26th: tomorrow for the venue.
      booking("c", "2026-11-26T22:30:00Z", { guests: 5 }),
      booking("d", "2026-11-26T17:00:00Z", { status: "CANCELLED" }),
    ];
    const s = todaySummary(list, NOW, 15);
    expect(s.day).toBe("2026-11-26");
    expect(s.today).toEqual({ bookings: 2, covers: 7, cancelled: 1 });
    expect(s.tomorrowTotals).toEqual({ bookings: 1, covers: 5, cancelled: 0 });
  });

  it("splits guests at the table, late and not marked", () => {
    const list = [
      booking("seated", "2026-11-26T15:30:00Z", { status: "CHECKED_IN", guests: 4 }),
      booking("late", "2026-11-26T15:50:00Z"),
      booking("unmarked", "2026-11-26T15:00:00Z"),
      booking("over", "2026-11-26T12:00:00Z"),
      booking("next", "2026-11-26T17:00:00Z"),
    ];
    const s = todaySummary(list, NOW, 15);
    expect(s.seated.map((b) => b.id)).toEqual(["seated"]);
    expect(s.seatedGuests).toBe(4);
    expect(s.late.map((b) => b.id)).toEqual(["late"]);
    // The 12:00 booking is over (its visit ended), so it no longer asks for a mark.
    expect(s.notMarked.map((b) => b.id)).toEqual(["unmarked"]);
    expect(s.next?.id).toBe("next");
    expect(s.upcoming.map((b) => b.id)).toEqual(["unmarked", "seated", "late", "next"]);
  });

  it("orders upcoming by the announced arrival and counts preorders of live bookings", () => {
    const preorder = { items: [{ qty: 2 }] } as unknown as CabinetBooking["preorder"];
    const list = [
      booking("due", "2026-11-26T16:30:00Z", {
        status: "CHECKED_IN",
        expectedArrival: Date.parse("2026-11-26T17:20:00Z"),
        preorder,
      }),
      booking("early", "2026-11-26T17:00:00Z", { preorder }),
      booking("gone", "2026-11-26T18:00:00Z", { status: "CANCELLED", preorder }),
    ];
    const s = todaySummary(list, NOW, 15);
    expect(s.upcoming.map((b) => b.id)).toEqual(["early", "due"]);
    expect(s.preorders).toBe(2);
  });

  it("finds the next guest on a later day when today is done", () => {
    const s = todaySummary([booking("tomorrow", "2026-11-27T10:00:00Z")], NOW, 15);
    expect(s.today.bookings).toBe(0);
    expect(s.next?.id).toBe("tomorrow");
  });
});

describe("hallNow", () => {
  it("adds up tables, seats and live statuses", () => {
    expect(
      hallNow([
        { seats: 4, status: "OCCUPIED" },
        { seats: 2, status: "FREE" },
        { seats: 6, status: "RESERVED" },
      ]),
    ).toEqual({ tables: 3, seats: 12, occupied: 1, reserved: 1 });
    expect(hallNow([])).toEqual({ tables: 0, seats: 0, occupied: 0, reserved: 0 });
  });
});

describe("shiftPhase", () => {
  it("places a shift before, during and after", () => {
    expect(shiftPhase({ start_time: "10:00", end_time: "18:00" }, 9 * 60)).toBe("later");
    expect(shiftPhase({ start_time: "10:00", end_time: "18:00" }, 10 * 60)).toBe("now");
    expect(shiftPhase({ start_time: "10:00", end_time: "18:00" }, 18 * 60)).toBe("done");
  });

  it("keeps a shift past midnight running late in the evening", () => {
    expect(shiftPhase({ start_time: "18:00", end_time: "02:00" }, 23 * 60 + 30)).toBe("now");
  });
});

describe("teamDay", () => {
  const roles = [role("waiter"), role("cook"), role("pizzaiolo"), role("runner", { in_schedule: false })];
  const staff = [member("w1", "waiter"), member("c1", "cook"), member("r1", "runner"), member("p1", "pizzaiolo", "INVITED")];

  it("lists today's shifts, who works now and pending confirmations", () => {
    const shifts = [
      shift("1", { staff_id: "w1", start_time: "17:00", end_time: "23:00" }),
      shift("2", { staff_id: "w1", start_time: "08:00", end_time: "12:00" }),
      shift("3", { staff_id: "c1", role: "cook", start_time: "19:00", status: "PENDING" }),
      shift("4", { staff_id: "w2", status: "DECLINED" }),
      shift("5", { staff_id: "w3", date: "2026-11-27" }),
    ];
    const team = teamDay(shifts, roles, staff, NOW);
    expect(team.shifts.map((s) => s.id)).toEqual(["2", "1", "3"]);
    expect(team.people).toBe(2);
    expect(team.onNow).toBe(1);
    expect(team.pending).toBe(1);
    // Cook is on shift; pizzaiolo only has an invited person; runner is outside the schedule.
    expect(team.uncoveredRoles).toEqual([]);
  });

  it("does not count someone who asked for a swap as working now", () => {
    const team = teamDay(
      [shift("1", { staff_id: "w1", status: "SWAP_REQUESTED" }), shift("2", { staff_id: "c1", role: "cook" })],
      roles,
      staff,
      NOW,
    );
    expect(team.people).toBe(2);
    expect(team.onNow).toBe(1);
  });

  it("names schedule roles with people but nobody on shift", () => {
    const team = teamDay([shift("1", { staff_id: "w1" })], roles, staff, NOW);
    expect(team.uncoveredRoles).toEqual(["cook"]);
  });

  it("does not list roles when nobody is scheduled at all", () => {
    expect(teamDay([], roles, staff, NOW).uncoveredRoles).toEqual([]);
  });
});

describe("shiftProblems", () => {
  it("keeps swap requests and declines from today on", () => {
    const shifts = [
      shift("old", { date: "2026-11-25", status: "SWAP_REQUESTED" }),
      shift("swap", { status: "SWAP_REQUESTED" }),
      shift("no", { date: "2026-11-28", status: "DECLINED" }),
      shift("ok"),
    ];
    const p = shiftProblems(shifts, NOW);
    expect(p.swap.map((s) => s.id)).toEqual(["swap"]);
    expect(p.declined.map((s) => s.id)).toEqual(["no"]);
  });
});

describe("venueSetup", () => {
  it("counts dishes, stop list, team and invitations", () => {
    expect(
      venueSetup([{ stopped: true }, { stopped: false }, {}], [{ status: "ACTIVE" }, { status: "INVITED" }, { status: "" }]),
    ).toEqual({ dishes: 3, stopped: 1, staff: 2, invited: 1 });
  });
});

describe("changeState", () => {
  const request = (id: string, status: string, at: string, note?: string): ProfileChangeRequest => ({
    id,
    application_id: "app-1",
    owner_user_id: "u",
    status,
    patch: {},
    created_at: at,
    note,
  });

  it("prefers a pending request", () => {
    expect(
      changeState([request("1", "REJECTED", "2026-11-25T10:00:00Z"), request("2", "PENDING", "2026-11-20T10:00:00Z")], "app-1"),
    ).toEqual({ kind: "pending", since: "2026-11-20T10:00:00Z" });
  });

  it("shows a rejection only while it is the latest answer", () => {
    expect(changeState([request("1", "REJECTED", "2026-11-25T10:00:00Z", "Нет фото")], "app-1")).toEqual({
      kind: "rejected",
      at: "2026-11-25T10:00:00Z",
      note: "Нет фото",
    });
    expect(
      changeState([request("1", "REJECTED", "2026-11-20T10:00:00Z"), request("2", "APPROVED", "2026-11-25T10:00:00Z")], "app-1"),
    ).toEqual({ kind: "none" });
  });

  it("ignores other venues", () => {
    expect(changeState([{ ...request("1", "PENDING", "2026-11-25T10:00:00Z"), application_id: "app-2" }], "app-1")).toEqual({
      kind: "none",
    });
  });
});

describe("attentionItems", () => {
  const empty: AttentionInput = {
    summary: null,
    team: null,
    shiftProblems: null,
    hall: null,
    setup: { menu: null, staff: null },
    change: null,
    waiterCalls: null,
  };

  it("gives nothing when nothing loaded", () => {
    expect(attentionItems(empty)).toEqual([]);
  });

  it("puts problems before warnings and notes", () => {
    const summary = todaySummary(
      [booking("late", "2026-11-26T15:50:00Z"), booking("unmarked", "2026-11-26T15:00:00Z")],
      NOW,
      15,
    );
    const items = attentionItems({
      ...empty,
      summary,
      shiftProblems: { swap: [shift("1", { staff_name: "Ирина" }), shift("2", { staff_name: "Ирина" })], declined: [] },
      hall: { tables: 0, seats: 0, occupied: 0, reserved: 0 },
      setup: { menu: { dishes: 10, stopped: 2, staff: 0, invited: 0 }, staff: { dishes: 0, stopped: 0, staff: 3, invited: 1 } },
      team: { shifts: [], onNow: 0, people: 0, pending: 0, uncoveredRoles: [] },
      change: { kind: "pending", since: "2026-11-25T10:00:00Z" },
      waiterCalls: 2,
    });
    expect(items.map((i) => i.kind)).toEqual([
      "shiftSwap",
      "noTables",
      "lateGuests",
      "noShiftsToday",
      "waiterCalls",
      "notMarked",
      "changePending",
      "staffInvited",
      "stopList",
    ]);
    expect(items[0]).toMatchObject({ count: 2, names: ["Ирина"], target: "shifts" });
    expect(items.find((i) => i.kind === "waiterCalls")).toMatchObject({ count: 2, target: "staffPanel" });
  });

  it("asks for a team before a schedule, and names uncovered roles", () => {
    const noTeam = attentionItems({
      ...empty,
      setup: { menu: null, staff: { dishes: 0, stopped: 0, staff: 0, invited: 2 } },
      team: { shifts: [], onNow: 0, people: 0, pending: 0, uncoveredRoles: [] },
    });
    expect(noTeam.map((i) => i.kind)).toEqual(["noStaff", "staffInvited"]);

    const uncovered = attentionItems({
      ...empty,
      setup: { menu: null, staff: { dishes: 0, stopped: 0, staff: 2, invited: 0 } },
      team: { shifts: [shift("1")], onNow: 1, people: 1, pending: 1, uncoveredRoles: ["cook"] },
    });
    expect(uncovered.map((i) => i.kind)).toEqual(["roleUncovered", "shiftPending"]);
    expect(uncovered[0].names).toEqual(["cook"]);
  });

  it("shows a rejected change request with the moderator note first", () => {
    const items = attentionItems({
      ...empty,
      setup: { menu: { dishes: 0, stopped: 0, staff: 0, invited: 0 }, staff: null },
      change: { kind: "rejected", at: "2026-11-25T10:00:00Z", note: "Уточните адрес" },
    });
    expect(items.map((i) => i.kind)).toEqual(["changeRejected", "noMenu"]);
    expect(items[0].note).toBe("Уточните адрес");
  });
});

describe("launchStage", () => {
  it("maps statuses to the launch path", () => {
    expect(launchStage("DRAFT")).toBe(0);
    expect(launchStage("REJECTED")).toBe(0);
    expect(launchStage("UNDER_REVIEW")).toBe(2);
    expect(launchStage("PUBLISHED")).toBe(4);
    expect(launchStage("SOMETHING")).toBe(0);
  });
});

describe("venuesToday", () => {
  it("counts today's bookings and covers per published venue", () => {
    const rows = [
      { venue_id: "v1", reserved_for: "2026-11-26T17:00:00Z", status: "CONFIRMED", guests: 2 },
      { venue_id: "v1", reserved_for: "2026-11-26T10:00:00Z", status: "CONFIRMED", guests: 4 },
      { venue_id: "v1", reserved_for: "2026-11-26T18:00:00Z", status: "CANCELLED", guests: 3 },
      { venue_id: "v1", reserved_for: "2026-11-27T18:00:00Z", status: "CONFIRMED", guests: 3 },
      { venue_id: "v2", reserved_for: "2026-11-26T19:00:00Z", status: "CHECKED_IN", guests: 5 },
    ];
    const apps = [
      { id: "a1", venue_id: "v1", status: "PUBLISHED" as const },
      { id: "a2", venue_id: "v2", status: "PUBLISHED" as const },
      { id: "a3", venue_id: null, status: "DRAFT" as const },
    ];
    expect(venuesToday(apps, rows, NOW)).toEqual([
      { applicationId: "a1", venueId: "v1", status: "PUBLISHED", today: { bookings: 2, covers: 6, cancelled: 1 } },
      { applicationId: "a2", venueId: "v2", status: "PUBLISHED", today: { bookings: 1, covers: 5, cancelled: 0 } },
      { applicationId: "a3", venueId: null, status: "DRAFT", today: { bookings: 0, covers: 0, cancelled: 0 } },
    ]);
  });
});
