"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchVenueSchedule,
  listMyApplications,
  listRestaurantReservations,
  type RestaurantReservation,
  type VenueScheduleSlot,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { sameDay } from "@/lib/date-picker";
import {
  axisHours,
  buildTableTimeline,
  gapSlots,
  minuteToDate,
  minuteTop,
  scrollTargetMin,
  type BusyBlock,
  type TableTimeline,
  type TimelineSegment,
} from "@/lib/table-timeline";
import type { OpeningHours } from "@/lib/booking-slots";

const DEFAULT_SLOT_MINUTES = 90;
const POLL_MS = 30_000;

export type ScheduleEvent = {
  id: string;
  tableId: string;
  startsAt: string;
  endsAt: string;
  tableNumber: number;
  status: string;
  guestName?: string;
  guests?: number;
  kind: string;
};

function fromOwnerRows(rows: RestaurantReservation[]): ScheduleEvent[] {
  return rows
    .filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
    .map((r) => {
      const start = new Date(r.reserved_for);
      const end = new Date(start.getTime() + DEFAULT_SLOT_MINUTES * 60_000);
      return {
        id: r.id,
        tableId: r.table_id,
        startsAt: r.reserved_for,
        endsAt: end.toISOString(),
        tableNumber: r.table_number,
        status: r.status,
        guestName: r.guest_name,
        guests: r.guests,
        kind: r.status === "CHECKED_IN" ? "OCCUPIED" : "RESERVATION",
      };
    });
}

function fromPublicSlots(slots: VenueScheduleSlot[]): ScheduleEvent[] {
  return slots.map((slot) => ({
    id: slot.id,
    tableId: slot.table_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    tableNumber: slot.table_number,
    status: slot.kind === "OCCUPIED" ? "CHECKED_IN" : "CONFIRMED",
    kind: slot.kind,
  }));
}

export type VenueSchedule = {
  events: ScheduleEvent[];
  /** The venue's owner / an admin sees guest names in the blocks. */
  staffView: boolean;
  loading: boolean;
  error: boolean;
};

/**
 * The venue's bookings and seated guests (public schedule; the owner's full list for
 * the owner or an admin), refreshed every 30 s and right away when `reloadKey` changes.
 */
export function useVenueSchedule({
  venueId,
  staffEnabled = false,
  isAdmin = false,
  reloadKey = 0,
}: {
  venueId: string;
  staffEnabled?: boolean;
  isAdmin?: boolean;
  reloadKey?: number;
}): VenueSchedule {
  const [state, setState] = useState<VenueSchedule>({ events: [], staffView: false, loading: true, error: false });

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        if (staffEnabled) {
          try {
            let owns = isAdmin;
            if (!isAdmin) {
              const apps = await listMyApplications();
              owns = apps.some((app) => app.venue_id === venueId);
            }
            if (owns) {
              const all = await listRestaurantReservations();
              if (!alive) return;
              setState({ events: fromOwnerRows(all.filter((r) => r.venue_id === venueId)), staffView: true, loading: false, error: false });
              return;
            }
          } catch {
            /* fall back to the public schedule */
          }
        }
        const slots = await fetchVenueSchedule(venueId);
        if (!alive) return;
        setState({ events: fromPublicSlots(slots), staffView: false, loading: false, error: false });
      } catch {
        if (alive) setState((prev) => ({ ...prev, loading: false, error: true }));
      }
    }

    void load();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [venueId, staffEnabled, isAdmin, reloadKey]);

  return state;
}

/** One table's blocks as timeline input. */
export function busyBlocksFor(
  events: ScheduleEvent[],
  tableId: string,
  mineReservationIds?: ReadonlySet<string>,
  staffView = false,
): BusyBlock[] {
  return events
    .filter((event) => event.tableId === tableId)
    .map((event) => ({
      id: event.id,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      kind: event.kind,
      mine: event.kind !== "OCCUPIED" && !!mineReservationIds?.has(event.id),
      label: staffView ? event.guestName : undefined,
    }));
}

/** Pixels per hour in the table's day view (Google Calendar-like vertical grid). */
export const DAY_HOUR_PX = 48;

type DayCalendarProps = {
  timeline: TableTimeline;
  day: Date;
  now: Date;
  onDayChange: (day: Date) => void;
  minDay: Date;
  maxDay: Date;
  /** Picked start (minutes from midnight of `day`). */
  selectedMin: number | null;
  onPick: (min: number) => void;
  /** Length of the visit a pick would book (drawn as the picked block). */
  minDurationMin: number;
  stepMin: number;
  /** Opening time of `day` (minutes): tap rows follow the booking grid from it. */
  openMin: number | null;
  /** Changes when another table or day is shown: the view scrolls to now / the first free time. */
  scrollKey: string;
  loading?: boolean;
  error?: boolean;
};

/**
 * The selected table's day as a vertical calendar (like Google Calendar): hours on the left,
 * a scrolling grid with closed hours hatched, booked / seated blocks labelled with their
 * start–end, free time in green where a tap picks the start, the picked visit drawn as a
 * block and a NOW line. It scrolls to now (or the first free time) when it opens.
 */
export function TableDayCalendar({
  timeline,
  day,
  now,
  onDayChange,
  minDay,
  maxDay,
  selectedMin,
  onPick,
  minDurationMin,
  stepMin,
  openMin,
  scrollKey,
  loading = false,
  error = false,
}: DayCalendarProps) {
  const { locale, t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(0);
  const clock = (min: number) =>
    minuteToDate(day, min).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const axisLabel = (min: number) =>
    minuteToDate(day, min).toLocaleTimeString(locale, locale === "en" ? { hour: "numeric" } : { hour: "2-digit", minute: "2-digit" });
  const top = (min: number) => minuteTop(min, timeline, DAY_HOUR_PX);
  const height = (from: number, to: number) => ((to - from) / 60) * DAY_HOUR_PX;
  const gridHeight = height(timeline.windowStartMin, timeline.windowEndMin);
  const hours = useMemo(() => axisHours(timeline), [timeline]);
  const isToday = sameDay(day, now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayLabel = isToday
    ? t("res.today")
    : sameDay(day, tomorrow)
      ? t("res.tomorrow")
      : day.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const shift = (days: number) => onDayChange(new Date(day.getFullYear(), day.getMonth(), day.getDate() + days));
  const canPrev = day.getTime() > minDay.getTime();
  const canNext = day.getTime() < maxDay.getTime();
  const hasBookable = timeline.segments.some((s) => s.kind === "free" && s.firstStartMin != null);
  const pickedGap =
    selectedMin != null
      ? timeline.segments.find((s) => s.kind === "free" && selectedMin >= s.startMin && selectedMin < s.endMin)
      : undefined;
  const pickedEnd = pickedGap ? Math.min(pickedGap.endMin, (selectedMin ?? 0) + minDurationMin) : null;

  // Scroll target follows every render; the scroll itself happens on open, on a new table / day,
  // and once the schedule has loaded.
  useEffect(() => {
    targetRef.current = scrollTargetMin(timeline, selectedMin);
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    const y = minuteTop(targetRef.current, timeline, DAY_HOUR_PX);
    el.scrollTop = Math.max(0, y - el.clientHeight * 0.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new table / day or after loading
  }, [scrollKey, loading]);

  function segmentBand(segment: TimelineSegment, index: number) {
    const style = { top: top(segment.startMin), height: height(segment.startMin, segment.endMin) };
    const tall = style.height >= 40;
    if (segment.kind === "closed" || segment.kind === "past") {
      return (
        <div key={`${segment.kind}-${index}`} className={`dcal-band is-${segment.kind}`} style={style}>
          {style.height >= 22 ? (
            <span className="dcal-band-label">{t(segment.kind === "closed" ? "bench.seg_closed" : "bench.seg_past")}</span>
          ) : null}
        </div>
      );
    }
    if (segment.kind === "busy") {
      const label =
        segment.label ||
        t(segment.busyKind === "seated" ? "bench.seg_seated" : segment.busyKind === "mine" ? "bench.seg_mine" : "bench.seg_reserved");
      return (
        <div
          key={segment.id}
          className={`dcal-block is-${segment.busyKind}${segment.current ? " is-current" : ""}${tall ? "" : " is-short"}`}
          style={style}
          title={`${clock(segment.startMin)}–${clock(segment.endMin)} · ${label}`}
        >
          <strong className="dcal-block-time">
            {clock(segment.startMin)}–{clock(segment.endMin)}
          </strong>
          <span className="dcal-block-label">{label}</span>
        </div>
      );
    }
    const slots = openMin == null ? [] : gapSlots(segment, { stepMin, minDurationMin, openMin });
    return (
      <div
        key={`free-${index}`}
        className={`dcal-band is-free${segment.firstStartMin == null ? " is-short" : ""}`}
        style={style}
      >
        {style.height >= 22 ? (
          <span className="dcal-band-label">
            {segment.firstStartMin == null ? t("bench.seg_short") : t("bench.cal_free")}
          </span>
        ) : null}
        {slots.map((slot) =>
          slot.bookable ? (
            <button
              key={slot.min}
              type="button"
              className={`dcal-slot${selectedMin === slot.min ? " is-active" : ""}`}
              style={{ top: top(slot.min) - style.top, height: height(slot.min, slot.min + stepMin) }}
              data-time={clock(slot.min)}
              aria-label={t("bench.slot_pick", { time: clock(slot.min) })}
              aria-pressed={selectedMin === slot.min}
              onClick={() => onPick(slot.min)}
            />
          ) : null,
        )}
      </div>
    );
  }

  return (
    <section className="dcal" aria-label={t("bench.schedule_head", { day: dayLabel })} aria-busy={loading}>
      <header className="dcal-head">
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          aria-label={t("venue.day_cal_prev")}
          disabled={!canPrev}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <span className="dcal-title">{dayLabel}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          aria-label={t("venue.day_cal_next")}
          disabled={!canNext}
          onClick={() => shift(1)}
        >
          ›
        </button>
      </header>

      {error ? <p className="dcal-empty">{t("common.error")}</p> : null}
      {timeline.closedDay ? (
        <p className="dcal-empty">{t("bench.day_closed")}</p>
      ) : (
        <>
          <div ref={scrollRef} className="dcal-scroll">
            <div className="dcal-grid" style={{ height: gridHeight }}>
              <div className="dcal-axis" aria-hidden="true">
                {hours.map((min) => (
                  <span key={min} className="dcal-hour" style={{ top: top(min) }}>
                    {axisLabel(min)}
                  </span>
                ))}
              </div>
              <div className="dcal-lane">
                {hours.map((min) => (
                  <i key={min} className="dcal-line" style={{ top: top(min) }} aria-hidden="true" />
                ))}
                {timeline.segments.map(segmentBand)}
                {selectedMin != null && pickedEnd != null ? (
                  <div
                    className="dcal-pick"
                    style={{ top: top(selectedMin), height: height(selectedMin, pickedEnd) }}
                    aria-hidden="true"
                  >
                    <strong className="dcal-block-time">
                      {clock(selectedMin)}–{clock(pickedEnd)}
                    </strong>
                    <span className="dcal-block-label">{t("bench.seg_free_picked")}</span>
                  </div>
                ) : null}
                {timeline.nowMin != null ? (
                  <div className="dcal-now" style={{ top: top(timeline.nowMin) }} aria-hidden="true">
                    <span>{t("bench.now", { time: clock(timeline.nowMin) })}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="dcal-hint">
            {hasBookable ? t("bench.cal_hint") : loading ? "" : t("bench.no_free_day")}
          </p>
        </>
      )}
    </section>
  );
}

/** Timeline of one table for one day (the inspector's data step). */
export function useTableTimeline({
  events,
  tableId,
  day,
  now,
  hours,
  minDurationMin,
  stepMin,
  mineReservationIds,
  staffView,
}: {
  events: ScheduleEvent[];
  tableId: string;
  day: Date;
  now: Date;
  hours: OpeningHours | null;
  minDurationMin: number;
  stepMin: number;
  mineReservationIds?: ReadonlySet<string>;
  staffView?: boolean;
}): TableTimeline {
  return useMemo(
    () =>
      buildTableTimeline({
        day,
        now,
        hours,
        busy: busyBlocksFor(events, tableId, mineReservationIds, staffView),
        minDurationMin,
        stepMin,
      }),
    [day, now, hours, events, tableId, mineReservationIds, staffView, minDurationMin, stepMin],
  );
}
