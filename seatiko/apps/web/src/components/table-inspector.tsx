"use client";

import { useEffect, useMemo, useState } from "react";
import type { Table } from "@/lib/api";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { TableDayTimeline, useTableTimeline, type VenueSchedule } from "@/components/venue-day-calendar";
import { BOOKING_DAYS_AHEAD, DEFAULT_SLOT_STEP_MIN, type OpeningHours } from "@/lib/booking-slots";
import { addDays, dayKey, sameDay, startOfDay } from "@/lib/date-picker";
import { normalizeZone, zoneLabel as fallbackZoneLabel } from "@/lib/floor-zones";
import { similarFreeTables } from "@/lib/floor-picks";
import { seatingRules } from "@/lib/seating-rules";
import { minuteToDate, nextFreeStart } from "@/lib/table-timeline";
import type { BookingRules } from "@/lib/venue-rules";

const ZONE_KEYS: Record<string, MessageKey> = {
  hall: "floor.zone.hall",
  terrace: "floor.zone.terrace",
  street: "floor.zone.street",
  garden: "floor.zone.garden",
  bar: "floor.zone.bar",
};

const STATUS_KEYS: Record<Table["status"], MessageKey> = {
  FREE: "table.status_free",
  RESERVED: "table.status_reserved",
  OCCUPIED: "table.status_occupied",
  CLEANING: "floor.leg_clean",
};

/** Same estimate as the plan: a visit lasts ~90 min, at least 15 min from now. */
const VISIT_MINUTES = 90;

type TableInspectorProps = {
  table: Table;
  tables: Table[];
  rules: BookingRules;
  hoursOn: (day: Date) => OpeningHours | null;
  schedule: VenueSchedule;
  mineReservationIds?: ReadonlySet<string>;
  /** The RESERVED booking on this table is the signed-in guest's. */
  mine: boolean;
  /** Book this table, starting at the picked time (null: let the popup choose). */
  onBook: (table: Table, startIso: string | null) => void;
  /** Switch the selection to another table (a free one similar to a busy table). */
  onPickTable: (table: Table) => void;
  onNotifyFree: (table: Table) => void;
  notifyDone: boolean;
  onImComing: (table: Table) => void;
  comingAccess: "allowed" | "sign_in" | "hidden";
  comingDone: boolean;
  comingTimeLabel?: string;
  onComingSignIn: () => void;
  message?: string | null;
};

/**
 * The panel next to the hall (under it on phones): the picked table, its state,
 * its day as a timeline with free windows to tap, and one booking CTA.
 * Nothing here covers the plan.
 */
export function TableInspector({
  table,
  tables,
  rules,
  hoursOn,
  schedule,
  mineReservationIds,
  mine,
  onBook,
  onPickTable,
  onNotifyFree,
  notifyDone,
  onImComing,
  comingAccess,
  comingDone,
  comingTimeLabel,
  onComingSignIn,
  message,
}: TableInspectorProps) {
  const { locale, t } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const today = useMemo(() => startOfDay(now), [now]);
  const lastDay = addDays(today, BOOKING_DAYS_AHEAD - 1);
  const [dayChoice, setDayChoice] = useState<Date | null>(null);
  const day = dayChoice && dayChoice.getTime() >= today.getTime() ? dayChoice : today;
  const [pick, setPick] = useState<{ key: string; min: number } | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const minDurationMin = rules.visit_duration_min;
  const stepMin = rules.booking_interval_min || DEFAULT_SLOT_STEP_MIN;
  const timeline = useTableTimeline({
    events: schedule.events,
    tableId: table.id,
    day,
    now,
    hours: hoursOn(day),
    minDurationMin,
    stepMin,
    mineReservationIds,
    staffView: schedule.staffView,
  });
  const firstFree = nextFreeStart(timeline);
  const key = `${table.id}|${dayKey(day)}`;
  const selectedMin = pick?.key === key ? pick.min : firstFree;

  const zoneId = normalizeZone(table.zone);
  const zoneName = ZONE_KEYS[zoneId] ? t(ZONE_KEYS[zoneId]) : fallbackZoneLabel(table.zone, locale);
  const isMine = mine && table.status === "RESERVED";
  const statusClass = isMine ? "reserved mine" : table.status.toLowerCase();
  const clockOf = (date: Date) => date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const clockIso = (iso?: string | null) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : clockOf(date);
  };
  const selectedDate = selectedMin != null ? minuteToDate(day, selectedMin) : null;
  const similar = table.status === "FREE" ? [] : similarFreeTables(tables, table);
  const reservedRules = table.reserved_for
    ? seatingRules(new Date(table.reserved_for), rules.session_start_before_min, rules.release_before_min)
    : null;
  const seatedUntil = (() => {
    const since = table.occupied_since ? new Date(table.occupied_since).getTime() : NaN;
    const soonest = now.getTime() + 15 * 60_000;
    return new Date(Number.isNaN(since) ? soonest : Math.max(soonest, since + VISIT_MINUTES * 60_000));
  })();
  const todayFirstFree = sameDay(day, today) ? firstFree : null;

  return (
    <aside className={`insp is-${table.status.toLowerCase()}${isMine ? " is-mine" : ""}`} aria-label={t("bench.inspector")}>
      <span className="insp-grab" aria-hidden="true" />
      <header className="insp-head">
        <h3>{t("table.title", { n: table.number })}</h3>
        <span className={`fa-floor-tip-status ${statusClass}`}>
          {isMine ? t("table.status_reserved_mine") : t(STATUS_KEYS[table.status])}
        </span>
      </header>

      <dl className="insp-tiles">
        <div>
          <dt>{t("floor.sheet_zone")}</dt>
          <dd>{zoneName}</dd>
        </div>
        <div>
          <dt>{t("bench.capacity")}</dt>
          <dd>{t("bench.capacity_value", { n: table.seats })}</dd>
        </div>
      </dl>

      {table.status === "OCCUPIED" ? (
        <div className="insp-state is-occupied">
          <p className="insp-lead">
            {todayFirstFree != null
              ? t("bench.busy_now_lead", { time: clockOf(minuteToDate(today, todayFirstFree)) })
              : t("bench.busy_now_none")}
          </p>
          <p>
            {t("bench.seated_info", { since: clockIso(table.occupied_since), until: clockOf(seatedUntil) })}
          </p>
          <div className="insp-actions">
            {similar[0] ? (
              <Button variant="secondary" size="md" block onClick={() => onPickTable(similar[0])}>
                {t("bench.pick_free", { n: similar[0].number })}
              </Button>
            ) : null}
            <Button variant="ghost" size="md" block disabled={notifyDone} onClick={() => onNotifyFree(table)}>
              {notifyDone ? t("table.notify_set") : `🔔 ${t("bench.notify_earlier")}`}
            </Button>
          </div>
        </div>
      ) : null}

      {table.status === "RESERVED" ? (
        <div className="insp-state is-reserved">
          <p className="insp-lead">
            {t(isMine ? "table.reserved_mine_for" : "table.reserved_for", { time: clockIso(table.reserved_for) })}
          </p>
          {reservedRules ? (
            <ul>
              {isMine ? null : (
                <li>{t("table.rule_walkin_until", { time: clockOf(reservedRules.walkInUntil) })}</li>
              )}
              <li>
                {t(
                  isMine
                    ? reservedRules.ownerFromNeedsFreeTable
                      ? "table.rule_mine_from_if_free"
                      : "table.rule_mine_from"
                    : reservedRules.ownerFromNeedsFreeTable
                      ? "table.rule_owner_from_if_free"
                      : "table.rule_owner_from",
                  { time: clockOf(reservedRules.ownerFrom) },
                )}
              </li>
            </ul>
          ) : null}
          <div className="insp-actions">
            {comingAccess === "allowed" ? (
              <Button variant="secondary" size="md" block disabled={comingDone} onClick={() => onImComing(table)}>
                {comingDone
                  ? t("table.im_coming_set", { time: comingTimeLabel ?? clockIso(table.reserved_for) })
                  : `✓ ${t("table.im_coming")}`}
              </Button>
            ) : null}
            {comingAccess === "sign_in" ? (
              <Button variant="ghost" size="md" block onClick={onComingSignIn}>
                {t("table.im_coming_sign_in")}
              </Button>
            ) : null}
            {isMine && table.reservation_id ? (
              <ButtonLink
                href={`/account?reservation=${encodeURIComponent(table.reservation_id)}`}
                variant="ghost"
                size="md"
                block
              >
                {t("table.open_my_booking")}
              </ButtonLink>
            ) : null}
            {!isMine && similar[0] ? (
              <Button variant="ghost" size="md" block onClick={() => onPickTable(similar[0])}>
                {t("bench.pick_free", { n: similar[0].number })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {table.status === "CLEANING" ? (
        <div className="insp-state is-cleaning">
          <p className="insp-lead">{t("floor.sheet_cleaning_lead")}</p>
          <p>{t("floor.sheet_cleaning_body")}</p>
          {similar[0] ? (
            <div className="insp-actions">
              <Button variant="secondary" size="md" block onClick={() => onPickTable(similar[0])}>
                {t("bench.pick_free", { n: similar[0].number })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <TableDayTimeline
        timeline={timeline}
        day={day}
        now={now}
        onDayChange={(next) => setDayChoice(next)}
        minDay={today}
        maxDay={lastDay}
        selectedMin={selectedMin}
        onPick={(min) => setPick({ key, min })}
        minDurationMin={minDurationMin}
        stepMin={stepMin}
        loading={schedule.loading}
        error={schedule.error}
      />

      {message ? (
        <p className="insp-msg" role="status">
          {message}
        </p>
      ) : null}

      {isMine ? null : (
        <div className="insp-cta">
          <Button
            size="lg"
            block
            onClick={() => onBook(table, selectedDate ? selectedDate.toISOString() : null)}
          >
            {selectedDate
              ? t("bench.book_at", { n: table.number, time: clockOf(selectedDate) })
              : t("bench.book_table", { n: table.number })}
          </Button>
        </div>
      )}
    </aside>
  );
}
