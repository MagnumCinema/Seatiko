"use client";

import { useEffect, useMemo, useState } from "react";
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
  buildTableTimeline,
  hourlyPills,
  minuteToDate,
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

type TimelineProps = {
  timeline: TableTimeline;
  day: Date;
  now: Date;
  onDayChange: (day: Date) => void;
  minDay: Date;
  maxDay: Date;
  /** Picked start (minutes from midnight of `day`). */
  selectedMin: number | null;
  onPick: (min: number) => void;
  minDurationMin: number;
  stepMin: number;
  loading?: boolean;
  error?: boolean;
};

/**
 * The selected table's day: closed hours greyed, booked / seated blocks with their times,
 * a NOW line, free windows you can tap (they pick the window's first start) and hourly
 * start pills under it.
 */
export function TableDayTimeline({
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
  loading = false,
  error = false,
}: TimelineProps) {
  const { locale, t } = useLocale();
  const clock = (min: number) =>
    minuteToDate(day, min).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const range = (segment: TimelineSegment) => `${clock(segment.startMin)}–${clock(segment.endMin)}`;
  const pills = useMemo(() => hourlyPills({ timeline, minDurationMin, stepMin }), [timeline, minDurationMin, stepMin]);
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

  function segmentRow(segment: TimelineSegment, index: number) {
    if (segment.kind === "closed" || segment.kind === "past") {
      return (
        <li key={`${segment.kind}-${index}`} className={`tl-seg is-${segment.kind}`}>
          <span className="tl-time">{range(segment)}</span>
          <span className="tl-label">{t(segment.kind === "closed" ? "bench.seg_closed" : "bench.seg_past")}</span>
        </li>
      );
    }
    if (segment.kind === "busy") {
      const label =
        segment.label ||
        t(segment.busyKind === "seated" ? "bench.seg_seated" : segment.busyKind === "mine" ? "bench.seg_mine" : "bench.seg_reserved");
      return (
        <li key={segment.id} className={`tl-seg is-busy is-${segment.busyKind}${segment.current ? " is-current" : ""}`}>
          <span className="tl-time">{range(segment)}</span>
          <span className="tl-label">{label}</span>
        </li>
      );
    }
    const first = segment.firstStartMin;
    if (first == null) {
      return (
        <li key={`free-${index}`} className="tl-seg is-short">
          <span className="tl-time">{range(segment)}</span>
          <span className="tl-label">{t("bench.seg_short")}</span>
        </li>
      );
    }
    const picked = selectedMin != null && selectedMin >= segment.startMin && selectedMin < segment.endMin;
    return (
      <li key={`free-${index}`}>
        <button
          type="button"
          className={`tl-seg is-free${picked ? " is-picked" : ""}`}
          aria-pressed={picked}
          onClick={() => onPick(first)}
        >
          <span className="tl-time">{range(segment)}</span>
          <span className="tl-label">
            <i aria-hidden="true" />
            {picked ? t("bench.seg_free_picked") : t("bench.seg_free")}
          </span>
        </button>
      </li>
    );
  }

  const rows: React.ReactNode[] = [];
  timeline.segments.forEach((segment, index) => {
    if (timeline.nowIndex === index && timeline.nowMin != null) {
      rows.push(
        <li key="now" className="tl-now" aria-hidden="true">
          <i />
          <span>{t("bench.now", { time: clock(timeline.nowMin) })}</span>
        </li>,
      );
    }
    rows.push(segmentRow(segment, index));
  });
  if (timeline.nowIndex === timeline.segments.length && timeline.nowMin != null) {
    rows.push(
      <li key="now" className="tl-now" aria-hidden="true">
        <i />
        <span>{t("bench.now", { time: clock(timeline.nowMin) })}</span>
      </li>,
    );
  }

  return (
    <section className="tl" aria-label={t("bench.schedule_head", { day: dayLabel })} aria-busy={loading}>
      <header className="tl-head">
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          aria-label={t("venue.day_cal_prev")}
          disabled={!canPrev}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <span className="tl-title">{dayLabel}</span>
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

      {error ? <p className="tl-empty">{t("common.error")}</p> : null}
      {timeline.closedDay ? (
        <p className="tl-empty">{t("bench.day_closed")}</p>
      ) : (
        <ol className="tl-list">{rows}</ol>
      )}

      {!timeline.closedDay && pills.length > 0 ? (
        <div className="tl-pills" role="group" aria-label={t("res.time")}>
          {pills.map((min) => (
            <button
              key={min}
              type="button"
              className={`chip${selectedMin === min ? " is-active" : ""}`}
              aria-pressed={selectedMin === min}
              onClick={() => onPick(min)}
            >
              {clock(min)}
            </button>
          ))}
        </div>
      ) : !timeline.closedDay && !loading ? (
        <p className="tl-empty">{t("bench.no_free_day")}</p>
      ) : null}
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
