"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchVenueSchedule,
  listMyApplications,
  listRestaurantReservations,
  type RestaurantReservation,
  type Table,
  type VenueScheduleSlot,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import type { OpeningHours } from "@/lib/booking-slots";

const START_HOUR = 10;
const END_HOUR = 23;
const HOUR_PX = 56;
const HOUR_PX_COMPACT = 34;
const COL_MIN_PX = 118;
const DEFAULT_SLOT_MINUTES = 90;
const POLL_MS = 30_000;

type CalendarEvent = {
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

type PositionedEvent = CalendarEvent & {
  top: number;
  height: number;
};

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function minutesFromGridStart(d: Date, startHour: number): number {
  return d.getHours() * 60 + d.getMinutes() - startHour * 60;
}

/** Opening hours of the venue, widened so every block of the day stays visible. */
function gridWindow(
  items: CalendarEvent[],
  day: Date,
  hours?: OpeningHours,
): { startHour: number; endHour: number } {
  let startHour = hours ? Math.floor(hours.openMin / 60) : START_HOUR;
  let endHour = hours ? Math.ceil(hours.closeMin / 60) : END_HOUR;
  for (const event of items) {
    if (event.status === "CANCELLED" || event.status === "NO_SHOW") continue;
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (Number.isNaN(start.getTime())) continue;
    if (sameDay(start, day)) startHour = Math.min(startHour, start.getHours());
    if (!Number.isNaN(end.getTime()) && sameDay(end, day)) {
      endHour = Math.max(endHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
    } else if (sameDay(start, day)) {
      endHour = 24;
    }
  }
  startHour = Math.max(0, Math.min(23, startHour));
  endHour = Math.max(startHour + 1, Math.min(24, endHour));
  return { startHour, endHour };
}

function positionEvents(
  items: CalendarEvent[],
  day: Date,
  hourPx: number,
  startHour: number,
  endHour: number,
): PositionedEvent[] {
  const gridSpan = (endHour - startHour) * 60;
  const out: PositionedEvent[] = [];

  for (const event of items) {
    if (event.status === "CANCELLED" || event.status === "NO_SHOW") continue;
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (Number.isNaN(start.getTime())) continue;
    if (!sameDay(start, day) && !(end.getTime() && sameDay(end, day))) continue;

    let startMin = minutesFromGridStart(start, startHour);
    let endMin = Number.isNaN(end.getTime())
      ? startMin + DEFAULT_SLOT_MINUTES
      : minutesFromGridStart(end, startHour);

    // Events that cross midnight into `day` from the previous evening.
    if (!sameDay(start, day) && sameDay(end, day)) {
      startMin = 0;
    }
    if (sameDay(start, day) && !sameDay(end, day) && end.getTime() > start.getTime()) {
      endMin = gridSpan;
    }

    if (endMin <= startMin) {
      endMin = startMin + DEFAULT_SLOT_MINUTES;
    }

    // Skip blocks that do not intersect the visible window.
    if (endMin <= 0 || startMin >= gridSpan) continue;

    const visibleStart = Math.max(0, startMin);
    const visibleEnd = Math.min(gridSpan, endMin);
    if (visibleEnd - visibleStart < 5) continue;

    out.push({
      ...event,
      top: (visibleStart / 60) * hourPx,
      height: Math.max(
        ((visibleEnd - visibleStart) / 60) * hourPx,
        compactMinHeight(hourPx),
      ),
    });
  }

  return out.sort((a, b) => a.top - b.top);
}

function compactMinHeight(hourPx: number) {
  return hourPx < 40 ? 22 : 28;
}

/** Split overlapping blocks in one table lane (Google Calendar columns). */
function packOverlaps(
  events: PositionedEvent[],
): (PositionedEvent & { leftPct: number; widthPct: number })[] {
  const sorted = [...events].sort(
    (a, b) => a.top - b.top || b.height - a.height,
  );
  const columns: PositionedEvent[][] = [];
  const colOf = new Map<string, number>();

  for (const event of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const last = col[col.length - 1];
      if (last.top + last.height <= event.top + 0.5) {
        col.push(event);
        colOf.set(event.id, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      colOf.set(event.id, columns.length);
      columns.push([event]);
    }
  }

  const colCount = Math.max(columns.length, 1);
  return sorted.map((event) => {
    const col = colOf.get(event.id) ?? 0;
    return {
      ...event,
      leftPct: (col / colCount) * 100,
      widthPct: 100 / colCount,
    };
  });
}

function statusTone(status: string, kind: string): string {
  if (kind === "OCCUPIED" || status === "CHECKED_IN") return "checked-in";
  if (status === "PENDING") return "pending";
  if (status === "NO_SHOW") return "no-show";
  return "confirmed";
}

function fromOwnerRows(rows: RestaurantReservation[]): CalendarEvent[] {
  return rows.map((r) => {
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
      kind: "RESERVATION",
    };
  });
}

function fromPublicSlots(slots: VenueScheduleSlot[]): CalendarEvent[] {
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

export function VenueDayCalendar({
  venueId,
  tables,
  focusTableId,
  compact = false,
  staffEnabled = false,
  isAdmin = false,
  openingHours,
  reloadKey = 0,
  mineReservationIds,
}: {
  venueId: string;
  tables: Table[];
  openingHours?: OpeningHours;
  /** Bump to reload right away (e.g. after the guest books). */
  reloadKey?: number;
  /** The signed-in guest's reservations, highlighted as "your booking". */
  mineReservationIds?: ReadonlySet<string>;
  /** When set, only this table’s day schedule is shown. */
  focusTableId?: string | null;
  compact?: boolean;
  staffEnabled?: boolean;
  isAdmin?: boolean;
}) {
  const { locale, t } = useLocale();
  const hourPx = compact ? HOUR_PX_COMPACT : HOUR_PX;
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [eventsRaw, setEventsRaw] = useState<CalendarEvent[]>([]);
  const [staffView, setStaffView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const orderedTables = useMemo(
    () => [...tables].sort((a, b) => a.number - b.number),
    [tables],
  );

  const focusTable = useMemo(() => {
    if (!focusTableId) return null;
    return orderedTables.find((table) => table.id === focusTableId) ?? null;
  }, [focusTableId, orderedTables]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let usedStaff = false;
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
              setEventsRaw(
                fromOwnerRows(all.filter((r) => r.venue_id === venueId)),
              );
              setStaffView(true);
              usedStaff = true;
            }
          } catch {
            usedStaff = false;
          }
        }
        if (!usedStaff) {
          const slots = await fetchVenueSchedule(venueId);
          if (!alive) return;
          setEventsRaw(fromPublicSlots(slots));
          setStaffView(false);
        }
      } catch {
        if (!alive) return;
        setError("load_failed");
        setEventsRaw([]);
        setStaffView(false);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [venueId, staffEnabled, isAdmin, reloadKey]);

  const { startHour, endHour } = useMemo(
    () => gridWindow(eventsRaw, day, openingHours),
    [eventsRaw, day, openingHours],
  );

  const positioned = useMemo(
    () => positionEvents(eventsRaw, day, hourPx, startHour, endHour),
    [eventsRaw, day, hourPx, startHour, endHour],
  );

  const eventsByTable = useMemo(() => {
    const map = new Map<string, PositionedEvent[]>();
    for (const table of orderedTables) map.set(table.id, []);
    for (const event of positioned) {
      const list = map.get(event.tableId);
      if (list) list.push(event);
      else {
        // Orphan event for a table not in current list — still show a lane.
        map.set(event.tableId, [event]);
      }
    }
    return map;
  }, [orderedTables, positioned]);

  const laneTables = useMemo(() => {
    if (focusTable) {
      return [focusTable];
    }
    return [] as Table[];
  }, [focusTable]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const showNow =
    sameDay(now, day) &&
    now.getHours() >= startHour &&
    now.getHours() < endHour;
  const nowTop = showNow
    ? (minutesFromGridStart(now, startHour) / 60) * hourPx
    : null;

  const dayLabel = day.toLocaleDateString(locale, {
    weekday: compact ? "short" : "long",
    day: "numeric",
    month: compact ? "short" : "long",
  });
  const isToday = sameDay(day, new Date());
  const gridHeight = (endHour - startHour) * hourPx;

  useEffect(() => {
    if (!focusTableId || compact) return;
    const el = document.getElementById("venue-day-schedule");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusTableId, compact]);

  return (
    <section
      id="venue-day-schedule"
      className={`venue-day-cal ${staffView ? "staff" : "guest"} ${focusTable ? "focused" : "idle"}${compact ? " compact" : ""}`}
      style={{ ["--day-cal-hour" as string]: `${hourPx}px` }}
      aria-label={
        staffView ? t("venue.day_cal_title") : t("venue.day_cal_guest_title")
      }
    >
      <header className="venue-day-cal-head">
        <div>
          {!compact ? (
            <p className="venue-page-kicker">
              {staffView
                ? t("venue.day_cal_kicker")
                : t("venue.day_cal_guest_kicker")}
            </p>
          ) : null}
          <h2>
            {focusTable
              ? t("venue.day_cal_table_title", { n: focusTable.number })
              : staffView
                ? t("venue.day_cal_title")
                : t("venue.day_cal_guest_title")}
          </h2>
          <p className="venue-day-cal-date">{dayLabel}</p>
          {!compact && !focusTable ? (
            <p className="venue-day-cal-hint">{t("venue.day_cal_pick_table")}</p>
          ) : null}
          {!compact && focusTable && !staffView ? (
            <p className="venue-day-cal-hint">{t("venue.day_cal_guest_hint")}</p>
          ) : null}
        </div>
        <div className="venue-day-cal-nav">
          <button
            type="button"
            className="venue-day-cal-nav-btn"
            onClick={() => setDay((d) => startOfDay(addDays(d, -1)))}
            aria-label={t("venue.day_cal_prev")}
            disabled={!focusTable}
          >
            ‹
          </button>
          <button
            type="button"
            className="venue-day-cal-nav-btn today"
            onClick={() => setDay(startOfDay(new Date()))}
            disabled={!focusTable || isToday}
          >
            {t("venue.day_cal_today")}
          </button>
          <button
            type="button"
            className="venue-day-cal-nav-btn"
            onClick={() => setDay((d) => startOfDay(addDays(d, 1)))}
            aria-label={t("venue.day_cal_next")}
            disabled={!focusTable}
          >
            ›
          </button>
        </div>
      </header>

      {error === "load_failed" ? (
        <p className="venue-day-cal-empty">{t("common.error")}</p>
      ) : null}

      {!focusTable ? (
        <p className={`venue-day-cal-empty${compact ? " pick" : " pick"}`}>
          {t("venue.day_cal_pick_table")}
        </p>
      ) : (
        <div className="venue-day-cal-scroll">
          <div
            className="venue-day-cal-board single"
            style={{
              ["--day-cal-cols" as string]: 1,
              ["--day-cal-col-min" as string]: compact
                ? "100%"
                : `${Math.max(COL_MIN_PX, 220)}px`,
            }}
          >
            <div className="venue-day-cal-corner" aria-hidden />
            <div className="venue-day-cal-cols-head">
              {laneTables.map((table) => {
                const status = table.status ?? "FREE";
                return (
                  <div
                    key={table.id}
                    className={`venue-day-cal-col-head ${String(status).toLowerCase()}`}
                  >
                    <strong>
                      {t("venue.day_cal_table", { n: table.number })}
                    </strong>
                    <small>{t("table.seats", { n: table.seats })}</small>
                  </div>
                );
              })}
            </div>

            <div className="venue-day-cal-hours" aria-hidden>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="venue-day-cal-hour"
                  style={{ height: hourPx }}
                >
                  <span>{String(hour).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            <div className="venue-day-cal-body" style={{ height: gridHeight }}>
              {nowTop != null ? (
                <div
                  className="venue-day-cal-now"
                  style={{ top: nowTop }}
                  title={t("venue.day_cal_now")}
                >
                  <i />
                  <span />
                  <em>{t("venue.day_cal_now")}</em>
                </div>
              ) : null}

              {laneTables.map((table) => {
                const events = packOverlaps(eventsByTable.get(table.id) ?? []);
                return (
                  <div key={table.id} className="venue-day-cal-lane">
                    {events.map((event) => {
                      const start = new Date(event.startsAt);
                      const end = new Date(event.endsAt);
                      const time = start.toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const until = end.toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const mine =
                        event.kind !== "OCCUPIED" && !!mineReservationIds?.has(event.id);
                      const tone = `${statusTone(event.status, event.kind)}${mine ? " mine" : ""}`;
                      return (
                        <article
                          key={event.id}
                          className={`venue-day-cal-event ${tone}`}
                          style={{
                            top: event.top,
                            height: event.height,
                            left: `calc(${event.leftPct}% + 3px)`,
                            width: `calc(${event.widthPct}% - 6px)`,
                            right: "auto",
                          }}
                          title={
                            staffView
                              ? `${event.guestName ?? ""} · ${time}–${until}`
                              : t("venue.day_cal_busy_until", {
                                  n: event.tableNumber,
                                  time: until,
                                })
                          }
                        >
                          <strong>
                            {time}–{until}
                          </strong>
                          {staffView ? (
                            <>
                              <span>
                                {event.guestName || t("venue.day_cal_guest")}
                              </span>
                              <small>
                                {t("venue.day_cal_party", {
                                  n: event.guests ?? 0,
                                })}
                              </small>
                            </>
                          ) : (
                            <>
                              <span>
                                {event.kind === "OCCUPIED"
                                  ? t("venue.day_cal_kind_seated")
                                  : mine
                                    ? t("venue.day_cal_kind_mine")
                                    : t("venue.day_cal_kind_reserved")}
                              </span>
                              <small>
                                {t("venue.day_cal_free_after", {
                                  time: until,
                                })}
                              </small>
                            </>
                          )}
                        </article>
                      );
                    })}
                    {!loading && events.length === 0 ? (
                      <p className="venue-day-cal-lane-free">
                        {t("venue.day_cal_table_free")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
