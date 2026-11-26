import type {
  ApplicationStatus,
  MenuItem,
  ProfileChangeRequest,
  RestaurantReservation,
  StaffMember,
  Table,
  VenueApplication,
  VenueRole,
  WorkShift,
} from "@/lib/api";
import {
  addDays,
  bookingState,
  dayKey,
  dayTotals,
  expectedAt,
  isClosed,
  isSeatedNow,
  isUpcoming,
  minutesIntoDay,
  nextArrival,
  sortBookings,
  VENUE_TIME_ZONE,
  type CabinetBooking,
  type DayTotals,
} from "@/lib/cabinet-bookings";
import { plannerRoles, roleCoverage } from "@/lib/venue-roles";

/**
 * «Обзор» tab of the owner cabinet: the start-of-the-day picture of one venue (today's bookings,
 * the team on shift, what needs the owner's attention, how far the venue is set up) and of the
 * owner's other venues. Pure functions on top of the bookings helpers, no React.
 */

/* ---------- Today ---------- */

export type TodaySummary = {
  /** Venue day keys, "YYYY-MM-DD". */
  day: string;
  tomorrow: string;
  today: DayTotals;
  tomorrowTotals: DayTotals;
  /** Checked in and the visit is still running. */
  seated: CabinetBooking[];
  seatedGuests: number;
  /** The next guest still expected (today or later). */
  next?: CabinetBooking;
  /** Time has come, the table is still held. */
  late: CabinetBooking[];
  /** Hold time passed today and nobody marked the guest. */
  notMarked: CabinetBooking[];
  /** Today's live bookings with dishes ordered ahead. */
  preorders: number;
  /** Still to come or at the table, soonest first (the «next guests» list). */
  upcoming: CabinetBooking[];
};

export function todaySummary(
  bookings: CabinetBooking[],
  now: number,
  holdMin: number,
  timeZone = VENUE_TIME_ZONE,
): TodaySummary {
  const day = dayKey(now, timeZone);
  const tomorrow = addDays(day, 1);
  const todayList = bookings.filter((b) => dayKey(b.start, timeZone) === day);
  const seated = todayList.filter((b) => isSeatedNow(b, now));
  const late: CabinetBooking[] = [];
  const notMarked: CabinetBooking[] = [];
  for (const b of todayList) {
    const state = bookingState(b, now, holdMin);
    if (state === "late") late.push(b);
    else if (state === "not_marked" && b.end > now) notMarked.push(b);
  }
  const preorders = todayList.filter(
    (b) => !isClosed(b) && (b.preorder?.items?.some((item) => item.qty > 0) ?? false),
  ).length;
  return {
    day,
    tomorrow,
    today: dayTotals(todayList),
    tomorrowTotals: dayTotals(bookings.filter((b) => dayKey(b.start, timeZone) === tomorrow)),
    seated,
    seatedGuests: seated.reduce((sum, b) => sum + b.guests, 0),
    next: nextArrival(bookings, now),
    late: sortBookings(late, "asc"),
    notMarked: sortBookings(notMarked, "asc"),
    preorders,
    upcoming: [...bookings.filter((b) => isUpcoming(b, now))].sort(
      (a, b) => expectedAt(a) - expectedAt(b) || (a.tableNumbers[0] ?? 0) - (b.tableNumbers[0] ?? 0),
    ),
  };
}

/* ---------- Hall ---------- */

export type HallNow = { tables: number; seats: number; occupied: number; reserved: number };

/** Tables of the plan and their live status (QR check-in, staff). */
export function hallNow(tables: Pick<Table, "seats" | "status">[]): HallNow {
  return {
    tables: tables.length,
    seats: tables.reduce((sum, t) => sum + (t.seats || 0), 0),
    occupied: tables.filter((t) => t.status === "OCCUPIED").length,
    reserved: tables.filter((t) => t.status === "RESERVED").length,
  };
}

/* ---------- Team ---------- */

/** "HH:MM" → minutes; shifts that end at or before their start run past midnight. */
function shiftSpan(shift: Pick<WorkShift, "start_time" | "end_time">): [number, number] | null {
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = parse(shift.start_time);
  let end = parse(shift.end_time);
  if (start === null || end === null) return null;
  if (end <= start) end += 24 * 60;
  return [start, end];
}

export type ShiftPhase = "now" | "later" | "done";

/** Where a shift of `day` stands at minute `nowMin` of that day. */
export function shiftPhase(shift: Pick<WorkShift, "start_time" | "end_time">, nowMin: number): ShiftPhase {
  const span = shiftSpan(shift);
  if (!span) return "later";
  if (nowMin < span[0]) return "later";
  if (nowMin < span[1]) return "now";
  return "done";
}

export type TeamDay = {
  /** Shifts of the day except declined ones, by start time. */
  shifts: WorkShift[];
  /** People working right now. */
  onNow: number;
  /** People with a shift today (a split shift counts once). */
  people: number;
  /** Not confirmed by the employee yet. */
  pending: number;
  /** Schedule roles that have people but nobody on shift today. */
  uncoveredRoles: string[];
};

export function teamDay(
  shifts: WorkShift[],
  roles: VenueRole[],
  staff: StaffMember[],
  now: number,
  timeZone = VENUE_TIME_ZONE,
): TeamDay {
  const day = dayKey(now, timeZone);
  const nowMin = minutesIntoDay(now, day, timeZone);
  const list = shifts
    .filter((s) => s.date === day && s.status !== "DECLINED")
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.staff_name.localeCompare(b.staff_name));
  // Someone who asked for a swap is not counted as working until the owner finds a replacement.
  const onNow = new Set(
    list.filter((s) => s.status !== "SWAP_REQUESTED" && shiftPhase(s, nowMin) === "now").map((s) => s.staff_id),
  );
  const scheduleRoles = plannerRoles(roles).map((r) => r.key);
  const coverage = roleCoverage(shifts, day, scheduleRoles);
  const active = staff.filter((m) => m.status !== "INVITED");
  const uncoveredRoles = list.length
    ? scheduleRoles.filter((key) => coverage[key] === 0 && active.some((m) => m.role === key))
    : [];
  return {
    shifts: list,
    onNow: onNow.size,
    people: new Set(list.map((s) => s.staff_id)).size,
    pending: list.filter((s) => s.status === "PENDING").length,
    uncoveredRoles,
  };
}

/** Upcoming shifts (from today on) the owner has to re-staff, as the sidebar badge counts them. */
export function shiftProblems(shifts: WorkShift[], now: number, timeZone = VENUE_TIME_ZONE) {
  const day = dayKey(now, timeZone);
  const upcoming = shifts.filter((s) => s.date >= day);
  return {
    swap: upcoming.filter((s) => s.status === "SWAP_REQUESTED"),
    declined: upcoming.filter((s) => s.status === "DECLINED"),
  };
}

/* ---------- Venue set-up ---------- */

export type VenueSetup = {
  dishes: number;
  stopped: number;
  staff: number;
  invited: number;
};

export function venueSetup(menu: Pick<MenuItem, "stopped">[], staff: Pick<StaffMember, "status">[]): VenueSetup {
  return {
    dishes: menu.length,
    stopped: menu.filter((item) => item.stopped).length,
    staff: staff.filter((m) => m.status !== "INVITED").length,
    invited: staff.filter((m) => m.status === "INVITED").length,
  };
}

/* ---------- Profile changes on moderation ---------- */

export type ChangeState =
  | { kind: "none" }
  | { kind: "pending"; since: string }
  | { kind: "rejected"; at: string; note: string };

/**
 * The owner's latest profile change request for this application: pending wins; a rejection
 * is shown only while it is the newest answer.
 */
export function changeState(requests: ProfileChangeRequest[], applicationId: string): ChangeState {
  const mine = requests
    .filter((r) => r.application_id === applicationId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pending = mine.find((r) => r.status === "PENDING");
  if (pending) return { kind: "pending", since: pending.created_at };
  const latest = mine[0];
  if (latest?.status === "REJECTED") return { kind: "rejected", at: latest.created_at, note: latest.note ?? "" };
  return { kind: "none" };
}

/* ---------- What needs attention ---------- */

export type AttentionTarget =
  | "profile"
  | "floor"
  | "menu"
  | "rules"
  | "staff"
  | "shifts"
  | "reservations";

export type AttentionKind =
  | "changeRejected"
  | "lateGuests"
  | "shiftSwap"
  | "shiftDeclined"
  | "noTables"
  | "noMenu"
  | "noShiftsToday"
  | "roleUncovered"
  | "waiterCalls"
  | "notMarked"
  | "noStaff"
  | "shiftPending"
  | "changePending"
  | "staffInvited"
  | "stopList";

export type AttentionTone = "danger" | "warn" | "info";

export type AttentionItem = {
  kind: AttentionKind;
  tone: AttentionTone;
  target: AttentionTarget | "staffPanel";
  count: number;
  /** Names to show: guests, employees or role keys. */
  names?: string[];
  /** Extra text from the API (moderator note). */
  note?: string;
  /** When it happened (ISO), e.g. a change request sent for review. */
  at?: string;
};

export type AttentionInput = {
  summary: TodaySummary | null;
  team: TeamDay | null;
  shiftProblems: ReturnType<typeof shiftProblems> | null;
  hall: HallNow | null;
  setup: { menu: VenueSetup | null; staff: VenueSetup | null };
  change: ChangeState | null;
  waiterCalls: number | null;
};

const TONE_ORDER: Record<AttentionTone, number> = { danger: 0, warn: 1, info: 2 };

/**
 * Everything the owner should look at, most urgent first. Inputs that failed to load are null
 * and simply give no items (the card says what is missing separately).
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const { summary, team, hall, setup, change } = input;
  const problems = input.shiftProblems;

  if (change?.kind === "rejected") {
    out.push({ kind: "changeRejected", tone: "danger", target: "profile", count: 1, note: change.note, at: change.at });
  }
  if (summary?.late.length) {
    out.push({
      kind: "lateGuests",
      tone: "warn",
      target: "reservations",
      count: summary.late.length,
      names: summary.late.map((b) => b.guestName),
    });
  }
  if (problems?.swap.length) {
    out.push({
      kind: "shiftSwap",
      tone: "danger",
      target: "shifts",
      count: problems.swap.length,
      names: unique(problems.swap.map((s) => s.staff_name)),
    });
  }
  if (problems?.declined.length) {
    out.push({
      kind: "shiftDeclined",
      tone: "danger",
      target: "shifts",
      count: problems.declined.length,
      names: unique(problems.declined.map((s) => s.staff_name)),
    });
  }
  if (hall && hall.tables === 0) out.push({ kind: "noTables", tone: "danger", target: "floor", count: 0 });
  if (setup.menu && setup.menu.dishes === 0) out.push({ kind: "noMenu", tone: "warn", target: "menu", count: 0 });
  if (setup.staff && setup.staff.staff === 0) {
    out.push({ kind: "noStaff", tone: "warn", target: "staff", count: 0 });
  } else if (team && setup.staff) {
    if (team.shifts.length === 0) {
      out.push({ kind: "noShiftsToday", tone: "warn", target: "shifts", count: 0 });
    } else if (team.uncoveredRoles.length) {
      out.push({
        kind: "roleUncovered",
        tone: "warn",
        target: "shifts",
        count: team.uncoveredRoles.length,
        names: team.uncoveredRoles,
      });
    }
  }
  if (input.waiterCalls && input.waiterCalls > 0) {
    out.push({ kind: "waiterCalls", tone: "warn", target: "staffPanel", count: input.waiterCalls });
  }
  if (summary?.notMarked.length) {
    out.push({
      kind: "notMarked",
      tone: "info",
      target: "reservations",
      count: summary.notMarked.length,
      names: summary.notMarked.map((b) => b.guestName),
    });
  }
  if (team?.pending) out.push({ kind: "shiftPending", tone: "info", target: "shifts", count: team.pending });
  if (change?.kind === "pending") {
    out.push({ kind: "changePending", tone: "info", target: "profile", count: 1, at: change.since });
  }
  if (setup.staff?.invited) out.push({ kind: "staffInvited", tone: "info", target: "staff", count: setup.staff.invited });
  if (setup.menu?.stopped) out.push({ kind: "stopList", tone: "info", target: "menu", count: setup.menu.stopped });

  return out
    .map((item, index) => ({ item, index }))
    .sort((a, b) => TONE_ORDER[a.item.tone] - TONE_ORDER[b.item.tone] || a.index - b.index)
    .map(({ item }) => item);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/* ---------- Launch (venues that are not published yet) ---------- */

export const LAUNCH_STAGES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED"] as const;

/** Index of the stage the application is at (a returned application is back at the profile). */
export function launchStage(status: ApplicationStatus | string): number {
  const normalized = status === "REJECTED" ? "DRAFT" : status;
  const index = LAUNCH_STAGES.indexOf(normalized as (typeof LAUNCH_STAGES)[number]);
  return index < 0 ? 0 : index;
}

/* ---------- All venues of the owner ---------- */

export type VenueDay = {
  applicationId: string;
  venueId: string | null;
  status: ApplicationStatus;
  today: DayTotals;
};

/** Today's bookings and covers of every venue, from the owner booking list. */
export function venuesToday(
  apps: Pick<VenueApplication, "id" | "venue_id" | "status">[],
  rows: Pick<RestaurantReservation, "venue_id" | "reserved_for" | "status" | "guests">[],
  now: number,
  timeZone = VENUE_TIME_ZONE,
): VenueDay[] {
  const day = dayKey(now, timeZone);
  return apps.map((app) => {
    const today = (app.venue_id ? rows.filter((r) => r.venue_id === app.venue_id) : []).filter((r) => {
      const start = Date.parse(r.reserved_for);
      return !Number.isNaN(start) && dayKey(start, timeZone) === day;
    });
    return {
      applicationId: app.id,
      venueId: app.venue_id ?? null,
      status: app.status,
      today: today.reduce<DayTotals>(
        (totals, r) =>
          isClosed(r)
            ? { ...totals, cancelled: totals.cancelled + 1 }
            : { ...totals, bookings: totals.bookings + 1, covers: totals.covers + r.guests },
        { bookings: 0, covers: 0, cancelled: 0 },
      ),
    };
  });
}
