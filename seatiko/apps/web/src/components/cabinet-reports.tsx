"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  ApiError,
  fetchVenueAnalytics,
  staffListReservations,
  type StaffMember,
  type VenueAnalytics,
  type VenueRole,
  type WorkShift,
} from "@/lib/api";
import {
  axisTicks,
  countDelta,
  formatRate,
  formatShare,
  hourly,
  labelEvery,
  leadTime,
  niceMax,
  peakHour,
  periodRange,
  rateDelta,
  reportCsv,
  returningGuests,
  series,
  sourceShares,
  summarize,
  teamHours,
  toReportBookings,
  weekdayAverages,
  type DayRange,
  type Delta,
  type Outcome,
  type ReportBooking,
  type SeriesPoint,
} from "@/lib/cabinet-analytics";
import { formatClock, formatDay, intlLocale } from "@/lib/cabinet-bookings";
import { fillTemplate as fill } from "@/lib/cabinet-team";
import { getSiteCopy } from "@/lib/site-copy";
import { roleColor, roleNameByKey } from "@/lib/venue-roles";

type Props = {
  venueId: string;
  staff: StaffMember[];
  roles: VenueRole[];
  shifts: WorkShift[] | null;
  presetNames: Record<string, string>;
};

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_KEY: Record<Period, "d7" | "d30" | "d90"> = { 7: "d7", 30: "d30", 90: "d90" };
const OUTCOMES: Outcome[] = ["arrived", "not_marked", "upcoming", "no_show", "cancelled"];
/** Orders the kitchen and the floor are still working on. */
const OPEN_ORDERS = ["SUBMITTED", "PREPARING", "READY"];
const REFRESH_MS = 120_000;

type LoadState = "loading" | "ready" | "error" | "not_live";

const utcDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** «Отчёты»: live hall numbers, then bookings, guests and team hours over a period. */
export function CabinetReports({ venueId, staff, roles, shifts, presetNames }: Props) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const intl = intlLocale(locale);
  const [rows, setRows] = useState<ReportBooking[]>([]);
  const [live, setLive] = useState<VenueAnalytics | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [period, setPeriod] = useState<Period>(30);

  const load = useCallback(
    async (quiet: boolean) => {
      if (quiet) setRefreshing(true);
      const [bookings, stats] = await Promise.allSettled([staffListReservations(venueId), fetchVenueAnalytics(venueId)]);
      setRefreshing(false);
      setNow(Date.now());
      // A venue that is not published yet has no floor: the analytics endpoint answers 404.
      if (stats.status === "rejected" && stats.reason instanceof ApiError && stats.reason.status === 404) {
        setState("not_live");
        return;
      }
      if (stats.status === "fulfilled") setLive(stats.value);
      if (bookings.status === "fulfilled") {
        setRows(toReportBookings(bookings.value));
        setUpdatedAt(Date.now());
        setState("ready");
      } else if (!quiet) {
        setState("error");
      }
    },
    [venueId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (state !== "ready") return;
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, load]);

  const range = useMemo(() => periodRange(period, now), [period, now]);
  const number = useMemo(() => new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }), [intl]);

  const rangeText = useCallback(
    (r: DayRange) => {
      const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4) && r.to.slice(0, 4) === new Date(now).getFullYear().toString();
      const f = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: sameYear ? undefined : "numeric", timeZone: "UTC" });
      return r.from === r.to ? f.format(utcDate(r.from)) : f.formatRange(utcDate(r.from), utcDate(r.to));
    },
    [intl, now],
  );

  if (state === "loading") {
    return (
      <div className="owner-section-empty" role="status">
        <span className="owner-inline-spinner" aria-hidden="true" />
        <p>{t.loading}</p>
      </div>
    );
  }
  if (state === "not_live") {
    return (
      <div className="owner-section-empty cs-empty">
        <span aria-hidden="true">
          <ChartIcon />
        </span>
        <h3>{t.notLiveTitle}</h3>
        <p>{t.notLiveBody}</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="owner-section-empty" role="alert">
        <h3>{t.failed}</h3>
        <button
          type="button"
          className="btn btn--primary btn--md"
          onClick={() => {
            setState("loading");
            void load(false);
          }}
        >
          {getSiteCopy(locale).cabinet.team.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="cs-reports">
      {live && (
        <LiveCard
          live={live}
          staff={staff}
          updatedAt={updatedAt}
          refreshing={refreshing}
          onRefresh={() => void load(true)}
        />
      )}

      {rows.length === 0 ? (
        <div className="owner-section-empty cs-empty">
          <span aria-hidden="true">
            <ChartIcon />
          </span>
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyBody}</p>
        </div>
      ) : (
        <PeriodReport
          rows={rows}
          now={now}
          period={period}
          onPeriod={setPeriod}
          range={range}
          rangeText={rangeText}
          number={number}
          staff={staff}
          roles={roles}
          shifts={shifts}
          presetNames={presetNames}
        />
      )}
      <p className="cs-footnote">{t.timezone}</p>
    </div>
  );
}

function LiveCard({
  live,
  staff,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  live: VenueAnalytics;
  staff: StaffMember[];
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const openOrders = OPEN_ORDERS.reduce((sum, s) => sum + (live.orders_by_status?.[s] ?? 0), 0);
  const working = staff.filter((m) => m.status !== "INVITED");
  const onShift = working.filter((m) => m.on_shift).length;
  const tiles: { label: string; value: number; of?: number }[] = [
    { label: t.liveFreeTables, value: live.free_tables, of: live.total_tables },
    { label: t.liveCalls, value: live.waiter_calls_pending },
    { label: t.liveOrders, value: openOrders },
    { label: t.liveOnShift, value: onShift, of: working.length },
  ];
  return (
    <section className="owner-card cs-card cs-live" aria-labelledby="cs-live-title">
      <div className="cs-card-head">
        <h3 id="cs-live-title">
          <span className="cs-live-dot" aria-hidden="true" />
          {t.liveTitle}
        </h3>
        <div className="cs-updated">
          {updatedAt > 0 && <span>{fill(t.updated, { time: formatClock(updatedAt) })}</span>}
          <button type="button" className="btn btn--secondary btn--sm btn--icon cb-icon-btn" aria-label={t.refresh} title={t.refresh} disabled={refreshing} onClick={onRefresh}>
            <span className={refreshing ? "cb-spin" : undefined}>
              <RefreshIcon />
            </span>
          </button>
        </div>
      </div>
      <div className="cs-live-grid">
        {tiles.map((tile) => (
          <div key={tile.label} className="cs-live-tile">
            <span>{tile.label}</span>
            <strong>
              {tile.value}
              {tile.of !== undefined && <small>{fill(t.liveOf, { total: tile.of })}</small>}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

type PeriodReportProps = {
  rows: ReportBooking[];
  now: number;
  period: Period;
  onPeriod: (p: Period) => void;
  range: ReturnType<typeof periodRange>;
  rangeText: (r: DayRange) => string;
  number: Intl.NumberFormat;
  staff: StaffMember[];
  roles: VenueRole[];
  shifts: WorkShift[] | null;
  presetNames: Record<string, string>;
};

function PeriodReport({ rows, now, period, onPeriod, range, rangeText, number, staff, roles, shifts, presetNames }: PeriodReportProps) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const intl = intlLocale(locale);

  const current = useMemo(() => summarize(rows, range.thisPeriod, now), [rows, range, now]);
  const previous = useMemo(() => summarize(rows, range.lastPeriod, now), [rows, range, now]);
  const points = useMemo(() => series(rows, range.thisPeriod, now), [rows, range, now]);
  const weekdays = useMemo(() => weekdayAverages(rows, range.thisPeriod, now), [rows, range, now]);
  const hours = useMemo(() => hourly(rows, range.thisPeriod, now), [rows, range, now]);
  const sources = useMemo(() => sourceShares(rows, range.thisPeriod), [rows, range]);
  const regulars = useMemo(() => returningGuests(rows, range.thisPeriod), [rows, range]);
  const lead = useMemo(() => leadTime(rows, range.thisPeriod), [rows, range]);
  const team = useMemo(() => (shifts ? teamHours(shifts, staff, range.thisPeriod) : null), [shifts, staff, range]);

  const weekly = points.length > 0 && points[0].from !== points[0].to;
  const percent = useCallback((value: number) => formatShare(value, intl), [intl]);
  const shortDay = useMemo(() => new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", timeZone: "UTC" }), [intl]);
  const weekdayDay = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", timeZone: "UTC" }), [intl]);
  const weekdayShort = useMemo(() => new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" }), [intl]);
  const today = range.thisPeriod.to;

  function exportCsv() {
    const header = [weekly ? t.colWeek : t.colDate, t.colBookings, t.colGuests, t.colCancelled, t.colNoShow, t.colArrived, t.colNotMarked, t.colUpcoming];
    const body = points.map((p) => [
      p.from === p.to ? p.from : `${p.from} – ${p.to}`,
      p.bookings,
      p.covers,
      p.cancelled,
      p.noShow,
      p.arrived,
      p.notMarked,
      p.upcoming,
    ]);
    const blob = new Blob(["﻿", reportCsv(header, body)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${t.csvFile}-${range.thisPeriod.from}_${range.thisPeriod.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const seriesTitle = weekly ? t.weeklyTitle : t.dailyTitle;
  const seriesColumns: ChartColumn[] = points.map((p) => ({
    key: p.key,
    label: weekly ? shortDay.format(utcDate(p.from)) : period === 7 ? weekdayDay.format(utcDate(p.from)) : shortDay.format(utcDate(p.from)),
    title: weekly ? rangeText({ from: p.from, to: p.to }) : `${formatDay(p.from, locale)}${p.from === today ? ` · ${t.today}` : ""}`,
    value: p.covers,
    lines: [fill(t.bookingsValue, { count: p.bookings }), ...(p.cancelled ? [`${t.colCancelled}: ${p.cancelled}`] : []), ...(p.noShow ? [`${t.colNoShow}: ${p.noShow}`] : [])],
  }));
  const weekdayColumns: ChartColumn[] = weekdays.map((d) => ({
    key: String(d.weekday),
    label: weekdayShort.format(utcDate(`2024-01-0${d.weekday}`)),
    title: new Intl.DateTimeFormat(intl, { weekday: "long", timeZone: "UTC" }).format(utcDate(`2024-01-0${d.weekday}`)),
    value: d.average,
    lines: [fill(t.guestsValue, { count: d.covers })],
  }));
  const hourColumns: ChartColumn[] = hours.map((h) => ({
    key: String(h.hour),
    label: `${String(h.hour).padStart(2, "0")}:00`,
    title: `${String(h.hour).padStart(2, "0")}:00–${String((h.hour + 1) % 24).padStart(2, "0")}:00`,
    value: h.covers,
    lines: [fill(t.bookingsValue, { count: h.bookings })],
  }));
  const peak = peakHour(hours);
  const pad = (n: number) => String(n % 24).padStart(2, "0");

  const kpis: Kpi[] = [
    {
      label: t.kpiGuests,
      value: number.format(current.covers),
      sub: current.avgParty !== null ? fill(t.kpiGuestsSub, { value: number.format(current.avgParty) }) : t.noData,
      delta: countDelta(current.covers, previous.covers),
      upIsGood: true,
    },
    {
      label: t.kpiBookings,
      value: number.format(current.bookings),
      sub: t.kpiBookingsSub,
      delta: countDelta(current.bookings, previous.bookings),
      upIsGood: true,
    },
    {
      label: t.kpiCancel,
      value: current.cancelRate !== null ? formatRate(current.cancelRate, intl) : "—",
      sub: current.bookings ? fill(t.kpiCancelSub, { count: current.cancelled, total: current.bookings }) : t.noData,
      delta: rateDelta(current.cancelRate, previous.cancelRate),
      upIsGood: false,
    },
    {
      label: t.kpiNoShow,
      value: current.noShowRate !== null ? formatRate(current.noShowRate, intl) : "—",
      sub:
        current.noShowRate !== null
          ? fill(t.kpiNoShowSub, { count: current.noShow, total: current.arrived + current.notMarked + current.noShow })
          : t.noData,
      delta: rateDelta(current.noShowRate, previous.noShowRate),
      upIsGood: false,
    },
  ];

  const seriesTable = (
    <DataTable
      caption={seriesTitle}
      head={[weekly ? t.colWeek : t.colDate, t.colBookings, t.colGuests, t.colCancelled, t.colNoShow]}
      rows={points.map((p: SeriesPoint) => [
        weekly ? rangeText({ from: p.from, to: p.to }) : formatDay(p.from, locale),
        p.bookings,
        p.covers,
        p.cancelled,
        p.noShow,
      ])}
    />
  );

  return (
    <>
      <div className="cs-report-bar">
        <div className="seg cs-periods" role="group" aria-label={t.periodLabel}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              className={`seg-item${period === p ? " is-active" : ""}`}
              onClick={() => onPeriod(p)}
            >
              {t.periods[PERIOD_KEY[p]]}
            </button>
          ))}
        </div>
        <p className="cs-range">
          <strong>{rangeText(range.thisPeriod)}</strong>
          <span>{fill(t.compare, { range: rangeText(range.lastPeriod) })}</span>
        </p>
        <button type="button" className="btn btn--secondary btn--sm cs-btn cs-export" onClick={exportCsv}>
          <DownloadIcon />
          {t.exportCsv}
        </button>
      </div>

      <div className="cs-kpis">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} kpi={kpi} percentPoints={t.pp} />
        ))}
      </div>

      {current.bookings === 0 ? (
        <p className="cb-note cs-period-empty">{t.periodEmpty}</p>
      ) : (
        <>
          <ChartCard title={seriesTitle} sub={t.seriesSub} table={seriesTable}>
            <ColumnChart
              columns={seriesColumns}
              title={seriesTitle}
              valueLine={(v) => fill(t.guestsValue, { count: number.format(v) })}
              valueText={(v) => number.format(v)}
              maxLabels={period === 7 ? 7 : 6}
              phoneLabels={period === 7 ? 7 : 3}
            />
          </ChartCard>

          <div className="cs-grid-2">
            <ChartCard
              title={t.weekdayTitle}
              sub={t.weekdaySub}
              table={
                <DataTable
                  caption={t.weekdayTitle}
                  head={[t.colWeekday, t.colAverage, t.colGuests]}
                  rows={weekdays.map((d, i) => [weekdayColumns[i].title, number.format(d.average), d.covers])}
                />
              }
            >
              <ColumnChart
                columns={weekdayColumns}
                title={t.weekdayTitle}
                valueLine={(v) => fill(t.averageValue, { value: number.format(v) })}
                valueText={(v) => number.format(v)}
                maxLabels={7}
              />
            </ChartCard>
            <ChartCard
              title={t.hourTitle}
              sub={t.hourSub}
              note={peak ? fill(t.peak, { from: `${pad(peak.hour)}:00`, to: `${pad(peak.hour + 1)}:00` }) : undefined}
              table={
                <DataTable
                  caption={t.hourTitle}
                  head={[t.colHour, t.colGuests, t.colBookings]}
                  rows={hours.map((h, i) => [hourColumns[i].title, h.covers, h.bookings])}
                />
              }
            >
              <ColumnChart
                columns={hourColumns}
                title={t.hourTitle}
                valueLine={(v) => fill(t.guestsValue, { count: number.format(v) })}
                valueText={(v) => number.format(v)}
                maxLabels={6}
              />
            </ChartCard>
          </div>

          <div className="cs-grid-2">
            <section className="owner-card cs-card" aria-labelledby="cs-outcome-title">
              <div className="cs-card-head">
                <h3 id="cs-outcome-title">{t.outcomeTitle}</h3>
              </div>
              <OutcomeBar
                counts={{
                  arrived: current.arrived,
                  not_marked: current.notMarked,
                  upcoming: current.upcoming,
                  no_show: current.noShow,
                  cancelled: current.cancelled,
                }}
                total={current.bookings}
                percent={percent}
              />
              {current.notMarked > 0 && <p className="cb-note">{t.notMarkedNote}</p>}
            </section>

            <section className="owner-card cs-card" aria-labelledby="cs-sources-title">
              <div className="cs-card-head">
                <h3 id="cs-sources-title">{t.sourcesTitle}</h3>
              </div>
              <MeterList
                rows={sources.map((s) => ({
                  key: s.source,
                  label: t.sources[s.source],
                  fraction: s.share,
                  display: `${s.count} · ${percent(s.share)}`,
                }))}
              />
              <div className="cs-mini-stats">
                <div>
                  <span>{t.returningTitle}</span>
                  <strong>{regulars.guests ? fill(t.returningValue, { returning: regulars.returning, guests: regulars.guests }) : "—"}</strong>
                  <small>{t.returningSub}</small>
                </div>
                <div>
                  <span>{t.leadTitle}</span>
                  <strong>
                    {lead
                      ? lead.medianHours < 24
                        ? fill(t.leadHours, { value: lead.medianHours < 1 ? "<1" : Math.round(lead.medianHours) })
                        : fill(t.leadDays, { value: number.format(Math.round((lead.medianHours / 24) * 10) / 10) })
                      : "—"}
                  </strong>
                  <small>{lead ? fill(t.leadSub, { share: percent(lead.sameDayShare) }) : t.noData}</small>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {team && (
        <section className="owner-card cs-card" aria-labelledby="cs-team-hours-title">
          <div className="cs-card-head">
            <div>
              <h3 id="cs-team-hours-title">{t.teamTitle}</h3>
              <p className="cs-card-sub">{t.teamSub}</p>
            </div>
            {team.shifts > 0 && (
              <p className="cs-team-total">{fill(t.teamTotal, { hours: number.format(team.totalHours), count: team.shifts })}</p>
            )}
          </div>
          {team.shifts === 0 && team.byPerson.every((p) => p.declined === 0) ? (
            <p className="cb-note">{t.teamEmpty}</p>
          ) : (
            <>
              <MeterList
                rows={team.byRole.map((r) => ({
                  key: r.role,
                  label: roleNameByKey(r.role, roles, presetNames),
                  color: roleColor(r.role, roles),
                  fraction: team.byRole[0].hours ? r.hours / team.byRole[0].hours : 0,
                  display: fill(t.hours, { value: number.format(r.hours) }),
                }))}
              />
              <DataTable
                caption={t.teamTitle}
                textColumns={2}
                head={[t.colPerson, t.colRole, t.colShifts, t.colHours, t.colDeclined, t.colSwaps]}
                rows={team.byPerson.map((p) => [
                  p.name,
                  roleNameByKey(p.role, roles, presetNames),
                  p.shifts,
                  number.format(p.hours),
                  p.declined || "—",
                  p.swaps || "—",
                ])}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}

/* ---------- Pieces ---------- */

type Kpi = { label: string; value: string; sub: string; delta: Delta | null; upIsGood: boolean };

function KpiTile({ kpi, percentPoints }: { kpi: Kpi; percentPoints: string }) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const intl = intlLocale(locale);
  const d = kpi.delta;
  let text: string = t.deltaNone;
  let tone: "up" | "down" | "flat" | "none" = "none";
  if (d?.kind === "new") {
    text = t.deltaNew;
    tone = "flat";
  } else if (d) {
    const value = d.value;
    const rounded = d.kind === "pct" ? Math.round(value * 100) : value;
    if (rounded === 0) tone = "flat";
    else tone = (rounded > 0) === kpi.upIsGood ? "up" : "down";
    text =
      d.kind === "pct"
        ? new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(value)
        : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value)} ${percentPoints}`;
  }
  const arrow = d && d.kind !== "new" ? (d.value > 0 ? "↑" : d.value < 0 ? "↓" : "→") : "";
  return (
    <article className="cs-kpi">
      <span>{kpi.label}</span>
      <strong>{kpi.value}</strong>
      <small>{kpi.sub}</small>
      <p className={`cs-delta is-${tone}`}>
        {arrow && <b aria-hidden="true">{arrow}</b>}
        <span>{text}</span>
        {d && d.kind !== "new" && <em>{t.deltaPrev}</em>}
      </p>
    </article>
  );
}

function ChartCard({
  title,
  sub,
  note,
  table,
  children,
}: {
  title: string;
  sub?: string;
  /** One short highlight under the subtitle (the peak hour). */
  note?: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const id = useId();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="owner-card cs-card cs-chart-card" aria-labelledby={`${id}-title`}>
      <div className="cs-card-head">
        <div>
          <h3 id={`${id}-title`}>{title}</h3>
          {sub && <p className="cs-card-sub">{sub}</p>}
          {note && <p className="cs-card-note">{note}</p>}
        </div>
        <button type="button" className="btn btn--secondary btn--sm cs-btn" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? t.showChart : t.showTable}
        </button>
      </div>
      {asTable ? table : children}
    </section>
  );
}

type ChartColumn = { key: string; label: string; title: string; value: number; lines: string[] };

/** Single-series column chart: hover, tap or arrow keys show a column's numbers. */
function ColumnChart({
  columns,
  title,
  valueLine,
  valueText,
  maxLabels,
  phoneLabels,
}: {
  columns: ChartColumn[];
  title: string;
  valueLine: (v: number) => string;
  valueText: (v: number) => string;
  maxLabels: number;
  /** Fewer axis labels on phones (a subset of the desktop ones). */
  phoneLabels?: number;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = columns.length;
  const max = Math.max(0, ...columns.map((c) => c.value));
  const top = niceMax(max);
  const ticks = axisTicks(top);
  const labeledList = labelEvery(n, maxLabels);
  const labeled = new Set(labeledList);
  const keepEvery = phoneLabels ? Math.ceil(labeledList.length / phoneLabels) : 1;
  const onPhones = new Set(labeledList.filter((_, j) => (labeledList.length - 1 - j) % keepEvery === 0));
  // Label the extreme only (the last highest column, closest to today).
  let peak = -1;
  columns.forEach((c, i) => {
    if (max > 0 && c.value === max) peak = i;
  });
  const summary = peak >= 0 ? fill(t.chartLabel, { title, label: columns[peak].title, value: valueText(max) }) : fill(t.chartEmpty, { title });
  const grid = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } as CSSProperties;

  function onKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!n) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = active === null ? 0 : Math.min(n - 1, active + 1);
    else if (event.key === "ArrowLeft") next = active === null ? n - 1 : Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  const activeColumn = active !== null ? columns[active] : null;
  const edge = active === null ? "" : active < n * 0.2 ? "is-start" : active > n * 0.8 ? "is-end" : "";

  return (
    <div className="cs-chart">
      <div className="cs-chart-y" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
            {valueText(tick)}
          </span>
        ))}
      </div>
      <div className="cs-chart-main">
        <div
          className="cs-chart-plot"
          role="group"
          tabIndex={0}
          aria-label={summary}
          aria-describedby={`${id}-readout`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
        >
          {ticks.map((tick) => (
            <i key={tick} className="cs-chart-grid" style={{ bottom: `${(tick / top) * 100}%` }} aria-hidden="true" />
          ))}
          <div className="cs-chart-cols" style={grid}>
            {columns.map((c, i) => {
              const height = (c.value / top) * 100;
              return (
                <div
                  key={c.key}
                  className={`cs-chart-slot${active === i ? " is-active" : ""}`}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
                  onPointerDown={() => setActive(i)}
                >
                  {c.value > 0 && <span className="cs-chart-col" style={{ height: `${height}%` }} />}
                  {i === peak && (
                    <em className="cs-chart-value" style={{ bottom: `${height}%` }} aria-hidden="true">
                      {valueText(c.value)}
                    </em>
                  )}
                </div>
              );
            })}
          </div>
          {activeColumn && (
            <div
              className={`cs-chart-tip ${edge}`}
              style={{ left: `${((active! + 0.5) / n) * 100}%` }}
              aria-hidden="true"
            >
              <strong>{valueLine(activeColumn.value)}</strong>
              <span>{activeColumn.title}</span>
              {activeColumn.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          )}
        </div>
        <div className="cs-chart-x" style={grid} aria-hidden="true">
          {columns.map((c, i) => (
            <span
              key={c.key}
              className={labeled.has(i) && !onPhones.has(i) ? "is-minor" : undefined}
              data-edge={n > 12 ? (i === 0 ? "start" : i === n - 1 ? "end" : undefined) : undefined}
            >
              {labeled.has(i) ? c.label : ""}
            </span>
          ))}
        </div>
      </div>
      <p id={`${id}-readout`} className="cs-sr" aria-live="polite">
        {activeColumn ? [activeColumn.title, valueLine(activeColumn.value), ...activeColumn.lines].join(". ") : ""}
      </p>
    </div>
  );
}

function OutcomeBar({
  counts,
  total,
  percent,
}: {
  counts: Record<Outcome, number>;
  total: number;
  percent: (v: number) => string;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team.report;
  const parts = OUTCOMES.filter((o) => counts[o] > 0);
  const summary = parts.map((o) => `${t.outcomes[o]}: ${counts[o]} (${percent(counts[o] / total)})`).join(", ");
  return (
    <div className="cs-outcomes">
      <div className="cs-seg" role="img" aria-label={`${t.outcomeTitle}: ${summary}`}>
        {parts.map((o) => {
          const share = counts[o] / total;
          return (
            <span key={o} className={`cs-seg-part o-${o}`} style={{ flexGrow: counts[o] }} title={`${t.outcomes[o]}: ${counts[o]} (${percent(share)})`}>
              {share >= 0.14 ? percent(share) : ""}
            </span>
          );
        })}
      </div>
      <ul className="cs-legend">
        {parts.map((o) => (
          <li key={o}>
            <i className={`o-${o}`} aria-hidden="true" />
            <span>{t.outcomes[o]}</span>
            <b>{counts[o]}</b>
            <small>{percent(counts[o] / total)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MeterList({ rows }: { rows: { key: string; label: string; fraction: number; display: string; color?: string }[] }) {
  return (
    <ul className="cs-meters">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="cs-meter-name">
            {row.color && <i style={{ "--role-color": row.color } as CSSProperties} aria-hidden="true" />}
            {row.label}
          </span>
          <span className="cs-meter-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(1, row.fraction)) * 100}%` }} />
          </span>
          <span className="cs-meter-value">{row.display}</span>
        </li>
      ))}
    </ul>
  );
}

/** The table twin of a chart (and the team table); the card title names it, so the caption is for screen readers. */
function DataTable({
  caption,
  head,
  rows,
  textColumns = 1,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
  /** Leading columns holding text (left-aligned); the rest are figures. */
  textColumns?: number;
}) {
  return (
    <div className="cs-table-wrap">
      <table className="cs-table">
        <caption className="cs-sr">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, j) => (
              <th key={h} scope="col" className={j < textColumns ? "is-text" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="is-text">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className={j < textColumns ? "is-text" : undefined}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M13 17V8M18 17v-9" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

