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

/** Vertical position (px) of a minute in the day view. */
export function minuteTop(min: number, timeline: Pick<TableTimeline, "windowStartMin">, hourPx: number): number {
  return ((min - timeline.windowStartMin) / 60) * hourPx;
}

/** Hours on the day view's left axis (minute offsets of each full hour in the window). */
export function axisHours(timeline: Pick<TableTimeline, "windowStartMin" | "windowEndMin">): number[] {
  const first = Math.ceil(timeline.windowStartMin / 60) * 60;
  const hours: number[] = [];
  for (let min = first; min < timeline.windowEndMin; min += 60) hours.push(min);
  return hours;
}

export type GapSlot = { min: number; bookable: boolean };

/**
 * Tap rows of a free gap in the day view, one per booking step on the grid that starts
 * at opening time. A row is bookable when a visit starting there fits before the gap ends
 * and it is not earlier than the gap's first bookable start (lead time).
 */
export function gapSlots(
  segment: Extract<TimelineSegment, { kind: "free" }>,
  { stepMin, minDurationMin, openMin }: { stepMin: number; minDurationMin: number; openMin: number },
): GapSlot[] {
  const step = stepMin > 0 ? stepMin : 30;
  const slots: GapSlot[] = [];
  for (let min = roundUpToStep(segment.startMin, openMin, step); min < segment.endMin; min += step) {
    const bookable =
      segment.firstStartMin != null && min >= segment.firstStartMin && min + minDurationMin <= segment.endMin;
    slots.push({ min, bookable });
  }
  return slots;
}

/**
 * Where the day view scrolls on open: to "now" when it is on today's grid, otherwise to the
 * picked / first bookable start, otherwise to opening time.
 */
export function scrollTargetMin(timeline: TableTimeline, selectedMin: number | null): number {
  if (timeline.nowMin != null) return timeline.nowMin;
  if (selectedMin != null) return selectedMin;
  const free = nextFreeStart(timeline);
  if (free != null) return free;
  const open = timeline.segments.find((segment) => segment.kind !== "closed");
  return open?.startMin ?? timeline.windowStartMin;
}
