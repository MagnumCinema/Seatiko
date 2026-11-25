import type { WorkShift } from "@/lib/api";

export function parseTimeMinutes(hhmm: string): number | null {
  const parts = (hhmm || "").trim().split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function calcDurationMinutes(start: string, end: string): number {
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  if (s === null || e === null) return 0;
  let mins = e - s;
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

export function shiftsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const s1 = parseTimeMinutes(startA);
  let e1 = parseTimeMinutes(endA);
  const s2 = parseTimeMinutes(startB);
  let e2 = parseTimeMinutes(endB);
  if (s1 === null || e1 === null || s2 === null || e2 === null) return true;
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;
  return s1 < e2 && s2 < e1;
}

export function getMemberActiveDayShifts(
  shifts: WorkShift[],
  staffId: string,
  date: string,
  excludeShiftId?: string,
): WorkShift[] {
  return shifts
    .filter(
      (s) =>
        s.id !== excludeShiftId &&
        s.staff_id === staffId &&
        s.date === date &&
        (s.status === "CONFIRMED" || s.status === "PENDING"),
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function findShiftConflict(
  shifts: WorkShift[],
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string,
): WorkShift | undefined {
  return getMemberActiveDayShifts(shifts, staffId, date, excludeShiftId).find((s) =>
    shiftsOverlap(startTime, endTime, s.start_time, s.end_time),
  );
}

/** Suggests a non-overlapping default slot when adding another shift on the same day. */
export function suggestNextShiftSlot(existingDayShifts: Pick<WorkShift, "start_time" | "end_time">[]): {
  start: string;
  end: string;
} {
  if (existingDayShifts.length === 0) {
    return { start: "10:00", end: "22:00" };
  }
  const hasMorning = existingDayShifts.some((s) => {
    const start = parseTimeMinutes(s.start_time);
    return start !== null && start < 13 * 60;
  });
  const candidates = hasMorning
    ? [
        { start: "18:00", end: "22:00" },
        { start: "14:00", end: "18:00" },
        { start: "12:00", end: "16:00" },
        { start: "08:00", end: "12:00" },
      ]
    : [
        { start: "08:00", end: "12:00" },
        { start: "12:00", end: "16:00" },
        { start: "18:00", end: "22:00" },
        { start: "14:00", end: "18:00" },
      ];
  const free = candidates.find((c) =>
    existingDayShifts.every((s) => !shiftsOverlap(c.start, c.end, s.start_time, s.end_time)),
  );
  return free ?? { start: "18:00", end: "22:00" };
}

/** Validates two intervals in a split-shift day do not overlap each other. */
export function splitIntervalsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return shiftsOverlap(start1, end1, start2, end2);
}
