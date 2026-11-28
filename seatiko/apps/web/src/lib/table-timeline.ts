/**
 * One table's day as a visual timeline: closed hours, booked / seated blocks with
 * times, free gaps (clickable when a visit still fits) and where "now" falls.
 * Minutes are counted from local midnight of `day` and may exceed 1440 when the
 * venue closes after midnight.
 */
import type { OpeningHours } from "@/lib/booking-slots";
import { MIN_LEAD_MIN } from "@/lib/booking-slots";

export type BusyBlock = {
  id: string;
  startsAt: string;
  endsAt: string;
  /** RESERVATION or OCCUPIED (seated now). */
  kind: string;
  mine?: boolean;
  /** Staff view only. */
  label?: string;
};

export type TimelineSegment =
  | { kind: "closed"; startMin: number; endMin: number }
  | { kind: "past"; startMin: number; endMin: number }
  | {
      kind: "free";
      startMin: number;
      endMin: number;
      /** Earliest bookable start inside the gap (lead time and step applied), or null when nothing fits. */
      firstStartMin: number | null;
    }
  | {
      kind: "busy";
      startMin: number;
      endMin: number;
      busyKind: "reserved" | "seated" | "mine";
      id: string;
      label?: string;
      /** Now is inside this block. */
      current: boolean;
    };

export type TableTimeline = {
  /** The venue does not open that day. */
  closedDay: boolean;
  segments: TimelineSegment[];
  /** Index in `segments` the NOW marker goes before; null when now is not on this day's grid. */
  nowIndex: number | null;
  nowMin: number | null;
  windowStartMin: number;
  windowEndMin: number;
};

/** The grid shows at least these hours so closed mornings / late evenings read as "closed". */
export const TIMELINE_MIN_START_HOUR = 10;
export const TIMELINE_MIN_END_HOUR = 23;

function minutesFromDayStart(iso: string, dayStart: number): number {
  return Math.round((new Date(iso).getTime() - dayStart) / 60_000);
}

function roundUpToStep(min: number, origin: number, step: number): number {
  if (step <= 0) return min;
  return origin + Math.ceil((min - origin) / step) * step;
}

export function buildTableTimeline({
  day,
  now,
  hours,
  busy,
  minDurationMin,
  stepMin,
  leadMin = MIN_LEAD_MIN,
}: {
  day: Date;
  now: Date;
  /** null: closed that day. */
  hours: OpeningHours | null;
  busy: BusyBlock[];
  /** Shortest visit a guest can book: a free gap must hold it. */
  minDurationMin: number;
  stepMin: number;
  leadMin?: number;
}): TableTimeline {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const nowMinRaw = Math.floor((now.getTime() - dayStart) / 60_000);

  if (!hours) {
    return {
      closedDay: true,
      segments: [],
      nowIndex: null,
      nowMin: null,
      windowStartMin: TIMELINE_MIN_START_HOUR * 60,
      windowEndMin: TIMELINE_MIN_END_HOUR * 60,
    };
  }

  const windowStartMin = Math.min(hours.openMin, TIMELINE_MIN_START_HOUR * 60);
  const windowEndMin = Math.max(hours.closeMin, TIMELINE_MIN_END_HOUR * 60);
  const openMin = hours.openMin;
  const closeMin = hours.closeMin;

  // Busy blocks clipped to opening hours, sorted, overlaps merged (same kind stays apart only when disjoint).
  const blocks = busy
    .map((block) => {
      const start = minutesFromDayStart(block.startsAt, dayStart);
      const end = minutesFromDayStart(block.endsAt, dayStart);
      const busyKind: "reserved" | "seated" | "mine" =
        block.kind === "OCCUPIED" ? "seated" : block.mine ? "mine" : "reserved";
      return { id: block.id, start, end, busyKind, label: block.label };
    })
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .map((b) => ({ ...b, start: Math.max(b.start, openMin), end: Math.min(b.end, closeMin) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: typeof blocks = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && block.start < last.end) {
      // Overlap: extend the earlier block; a seated guest wins over a booking label.
      last.end = Math.max(last.end, block.end);
      if (block.busyKind === "seated") last.busyKind = "seated";
      continue;
    }
    merged.push({ ...block });
  }

  const earliestStart = nowMinRaw + leadMin;
  const segments: TimelineSegment[] = [];
  if (windowStartMin < openMin) segments.push({ kind: "closed", startMin: windowStartMin, endMin: openMin });

  const pushFree = (start: number, end: number) => {
    if (end <= start) return;
    // The part of a gap already behind us is "past".
    if (nowMinRaw > start) {
      const pastEnd = Math.min(end, nowMinRaw);
      segments.push({ kind: "past", startMin: start, endMin: pastEnd });
      start = pastEnd;
      if (end <= start) return;
    }
    let first = roundUpToStep(Math.max(start, earliestStart), openMin, stepMin);
    if (first + minDurationMin > end) first = Number.NaN;
    segments.push({ kind: "free", startMin: start, endMin: end, firstStartMin: Number.isNaN(first) ? null : first });
  };

  let cursor = openMin;
  for (const block of merged) {
    pushFree(cursor, block.start);
    segments.push({
      kind: "busy",
      startMin: block.start,
      endMin: block.end,
      busyKind: block.busyKind,
      id: block.id,
      label: block.label,
      current: nowMinRaw >= block.start && nowMinRaw < block.end,
    });
    cursor = Math.max(cursor, block.end);
  }
  pushFree(cursor, closeMin);
  if (windowEndMin > closeMin) segments.push({ kind: "closed", startMin: closeMin, endMin: windowEndMin });

  const onGrid = nowMinRaw >= windowStartMin && nowMinRaw < windowEndMin;
  let nowIndex: number | null = null;
  if (onGrid) {
    const index = segments.findIndex((segment) => segment.endMin > nowMinRaw);
    nowIndex = index < 0 ? segments.length : index;
  }

  return {
    closedDay: false,
    segments,
    nowIndex,
    nowMin: onGrid ? nowMinRaw : null,
    windowStartMin,
    windowEndMin,
  };
}

/** The first moment the table can be booked on this day (start minute), or null. */
export function nextFreeStart(timeline: TableTimeline): number | null {
  for (const segment of timeline.segments) {
    if (segment.kind === "free" && segment.firstStartMin != null) return segment.firstStartMin;
  }
  return null;
}

/** "HH:MM" for a minute offset (wraps after midnight). */
export function clockLabel(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** Local Date of a minute offset on `day`. */
export function minuteToDate(day: Date, min: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min);
}

/**
 * Start-time pills under the timeline: every whole hour that can be booked, plus the first
 * bookable start of each free gap (e.g. 17:30 right after a booking ends).
 */
export function hourlyPills({
  timeline,
  minDurationMin,
  stepMin,
}: {
  timeline: TableTimeline;
  minDurationMin: number;
  stepMin: number;
}): number[] {
  const pills = new Set<number>();
  for (const segment of timeline.segments) {
    if (segment.kind !== "free" || segment.firstStartMin == null) continue;
    pills.add(segment.firstStartMin);
    const step = stepMin > 0 ? stepMin : 30;
    for (let min = segment.firstStartMin; min + minDurationMin <= segment.endMin; min += step) {
      if (min % 60 === 0) pills.add(min);
    }
  }
  return [...pills].sort((a, b) => a - b);
}
