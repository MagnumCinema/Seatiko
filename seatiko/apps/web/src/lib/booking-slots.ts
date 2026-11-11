export type BusyRange = { starts_at: string; ends_at: string };

export type BookingSlot = {
  /** Local start time as a Date; send `start.toISOString()` to the API. */
  start: Date;
  available: boolean;
};

export type OpeningHours = { openMin: number; closeMin: number };

export const DEFAULT_OPENING_HOURS: OpeningHours = { openMin: 10 * 60, closeMin: 23 * 60 };
export const DEFAULT_SLOT_STEP_MIN = 30;
export const DEFAULT_BOOKING_DURATION_MIN = 90;
/** A guest cannot book a slot starting sooner than this from now. */
export const MIN_LEAD_MIN = 15;

/** Parses "Пн–Вс 10:00–22:00" / "Mon–Sun 08:30–22:00" into minutes from midnight. */
export function parseOpeningHours(text: string | null | undefined): OpeningHours {
  const match = text?.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return DEFAULT_OPENING_HOURS;
  const openMin = Number(match[1]) * 60 + Number(match[2]);
  let closeMin = Number(match[3]) * 60 + Number(match[4]);
  if (closeMin <= openMin) closeMin += 24 * 60;
  return { openMin, closeMin };
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export type TableCandidate = { id: string; seats: number; busy: BusyRange[] };

export type AnyTableSlot = BookingSlot & {
  /** Best-fitting free table for this start (fewest spare seats), or null. */
  tableId: string | null;
};

/**
 * Slots for "any free table": a start is available when at least one candidate
 * table is free then; the smallest table that fits is picked to keep big ones free.
 */
export function buildAnyTableSlots({
  candidates,
  ...options
}: Omit<Parameters<typeof buildBookingSlots>[0], "busy"> & {
  candidates: TableCandidate[];
}): AnyTableSlot[] {
  const bySize = [...candidates].sort((a, b) => a.seats - b.seats);
  const perTable = bySize.map((table) => ({
    id: table.id,
    slots: buildBookingSlots({ ...options, busy: table.busy }),
  }));
  const base = buildBookingSlots({ ...options, busy: [] });
  return base.map((slot, index) => {
    const winner = perTable.find((table) => table.slots[index]?.available);
    return { start: slot.start, available: Boolean(winner), tableId: winner?.id ?? null };
  });
}

/** Booking start times for one table on one local day, marked unavailable when past or overlapping busy ranges. */
export function buildBookingSlots({
  day,
  now,
  hours = DEFAULT_OPENING_HOURS,
  stepMin = DEFAULT_SLOT_STEP_MIN,
  durationMin = DEFAULT_BOOKING_DURATION_MIN,
  busy = [],
}: {
  day: Date;
  now: Date;
  hours?: OpeningHours;
  stepMin?: number;
  durationMin?: number;
  busy?: BusyRange[];
}): BookingSlot[] {
  const step = stepMin > 0 ? stepMin : DEFAULT_SLOT_STEP_MIN;
  const base = startOfLocalDay(day);
  const earliest = now.getTime() + MIN_LEAD_MIN * 60_000;
  const ranges = busy
    .map((range) => [new Date(range.starts_at).getTime(), new Date(range.ends_at).getTime()])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e));

  const slots: BookingSlot[] = [];
  for (let min = hours.openMin; min + durationMin <= hours.closeMin; min += step) {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, min);
    const s = start.getTime();
    const e = s + durationMin * 60_000;
    const overlaps = ranges.some(([bs, be]) => s < be && e > bs);
    slots.push({ start, available: s >= earliest && !overlaps });
  }
  return slots;
}
