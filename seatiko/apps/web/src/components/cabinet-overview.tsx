"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { StatusBadge } from "@/components/status-badge";
import { CabinetBookingsPreview } from "@/components/cabinet-bookings";
import {
  fetchTables,
  fetchVenue,
  fetchVenueAnalytics,
  listMyChangeRequests,
  listOwnerMenu,
  listRestaurantReservations,
  listVenueRoles,
  listVenueStaff,
  listVenueWorkShifts,
  staffListReservations,
  type MenuItem,
  type ProfileChangeRequest,
  type Reservation,
  type RestaurantReservation,
  type StaffMember,
  type Table,
  type Venue,
  type VenueAnalytics,
  type VenueApplication,
  type VenueRole,
  type WorkShift,
} from "@/lib/api";
import {
  DEFAULT_VISIT_MIN,
  dayKey,
  daysBetween,
  expectedAt,
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
  intlLocale,
  mergeBookings,
  minutesIntoDay,
  VENUE_TIME_ZONE,
  venueRules,
  type BookingPeriod,
} from "@/lib/cabinet-bookings";
import {
  attentionItems,
  changeState,
  hallNow,
  LAUNCH_STAGES,
  launchStage,
  shiftPhase,
  shiftProblems,
  teamDay,
  todaySummary,
  venueSetup,
  venuesToday,
  type AttentionItem,
  type AttentionTarget,
} from "@/lib/cabinet-overview";
import { pluralize, type PluralForms } from "@/lib/cabinet-helpers";
import { getSiteCopy } from "@/lib/site-copy";
import { roleNameByKey, shiftRoleLabel } from "@/lib/venue-roles";

export type OverviewTarget = AttentionTarget | "activity";

const POLL_MS = 60_000;
const FOCUS_REFRESH_GAP_MS = 15_000;
const TEAM_ROWS = 6;
const ATTENTION_ROWS = 5;
const GUEST_ROWS = 5;
const NAMES_SHOWN = 2;
/** Requests the overview makes (the owner list plus nine venue parts). */
const PART_COUNT = 10;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const capitalize = (value: string) => (value ? value[0].toLocaleUpperCase() + value.slice(1) : value);

/* ---------- Icons ---------- */

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const RefreshIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Icon>
);
const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);
const AlertIcon = () => (
  <Icon>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);
const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
);
const LockIcon = () => (
  <Icon size={14}>
    <rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);
const ChevronIcon = () => (
  <Icon size={14}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon size={20}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);

/* ---------- Text ---------- */

function useOverviewText() {
  const { locale } = useLocale();
  return useMemo(() => {
    const site = getSiteCopy(locale);
    const cabinet = site.cabinet;
    const copy = cabinet.overviewTab;
    const bookings = cabinet.bookings;
    const count = (n: number, forms: PluralForms) => `${n} ${pluralize(n, forms, locale)}`;
    const names = (list: string[]) => {
      const shown = list.slice(0, NAMES_SHOWN).join(", ");
      const rest = list.length - NAMES_SHOWN;
      return rest > 0 ? `${shown} ${fill(copy.andMore, { n: rest })}` : shown;
    };
    const duration = (minutes: number) =>
      formatDuration(minutes, {
        hours: bookings.hoursUnit,
        minutes: bookings.minutesUnit,
        hoursMinutes: bookings.hoursMinutesUnit,
      });
    return { locale, site, cabinet, copy, bookings, ui: cabinet.ui, count, names, duration };
  }, [locale]);
}

type Text = ReturnType<typeof useOverviewText>;

/** "Сегодня" / "Завтра" or a short date for a venue day. */
function relativeDay(text: Text, key: string, today: string) {
  const diff = daysBetween(today, key);
  if (diff === 0) return text.bookings.today;
  if (diff === 1) return text.bookings.tomorrow;
  return formatDay(key, text.locale, { weekday: false });
}

/* ---------- Data of a published venue ---------- */

type Parts = {
  details: Reservation[] | null;
  venue: Venue | null;
  tables: Table[] | null;
  menu: MenuItem[] | null;
  staff: StaffMember[] | null;
  shifts: WorkShift[] | null;
  roles: VenueRole[] | null;
  analytics: VenueAnalytics | null;
  changes: ProfileChangeRequest[] | null;
};

type PartKey = keyof Parts | "owner";

const EMPTY_PARTS: Parts = {
  details: null,
  venue: null,
  tables: null,
  menu: null,
  staff: null,
  shifts: null,
  roles: null,
  analytics: null,
  changes: null,
};

const settle = <T,>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const }),
  );

/**
 * Everything the overview of one published venue needs, refreshed every minute while the tab is
 * visible and on return to it. A failed request keeps the last good data and is reported apart.
 */
function useVenueDay(venueId: string, onOwnerRows: (rows: RestaurantReservation[]) => void) {
  const [parts, setParts] = useState<Parts>(EMPTY_PARTS);
  const [failed, setFailed] = useState<PartKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestRef = useRef(0);
  const onOwnerRowsRef = useRef(onOwnerRows);

  useEffect(() => {
    onOwnerRowsRef.current = onOwnerRows;
  }, [onOwnerRows]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setRefreshing(true);
    const [owner, details, venue, tables, menu, staff, shifts, roles, analytics, changes] = await Promise.all([
      settle(listRestaurantReservations()),
      settle(staffListReservations(venueId)),
      settle(fetchVenue(venueId)),
      settle(fetchTables(venueId)),
      settle(listOwnerMenu(venueId)),
      settle(listVenueStaff(venueId)),
      settle(listVenueWorkShifts(venueId)),
      settle(listVenueRoles(venueId)),
      settle(fetchVenueAnalytics(venueId)),
      settle(listMyChangeRequests()),
    ]);
    if (request !== requestRef.current) return;
    if (owner.ok) onOwnerRowsRef.current(owner.value);
    const results = {
      details,
      venue,
      tables,
      menu,
      staff,
      shifts,
      roles: roles.ok ? { ok: true as const, value: roles.value.roles } : roles,
      analytics,
      changes,
    };
    setParts((current) => {
      const next = { ...current } as Record<keyof Parts, unknown>;
      for (const [key, result] of Object.entries(results)) {
        if (result.ok) next[key as keyof Parts] = result.value;
      }
      return next as Parts;
    });
    const bad = (Object.entries(results) as [keyof Parts, { ok: boolean }][])
      .filter(([, result]) => !result.ok)
      .map(([key]) => key as PartKey);
    if (!owner.ok) bad.unshift("owner");
    setFailed(bad);
    setRefreshing(false);
    setLoaded(true);
    if (bad.length < PART_COUNT) setUpdatedAt(Date.now());
  }, [venueId]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      requestRef.current += 1;
    };
  }, [load]);

  const updatedAtRef = useRef(updatedAt);
  useEffect(() => {
    updatedAtRef.current = updatedAt;
  }, [updatedAt]);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (updatedAtRef.current && Date.now() - updatedAtRef.current < FOCUS_REFRESH_GAP_MS) return;
      void load();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [load]);

  return { parts, failed, loaded, refreshing, updatedAt, reload: load };
}

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/* ---------- Panel ---------- */

export type CabinetOverviewProps = {
  application: VenueApplication;
  apps: VenueApplication[];
  /** Owner booking rows of every venue (the cabinet keeps them in step with the bookings tab). */
  ownerRows: RestaurantReservation[];
  checks: { label: string; done: boolean }[];
  canEdit: boolean;
  busy: boolean;
  statusHint: string;
  venueTitle: (app: VenueApplication) => string;
  onOpenSection: (target: OverviewTarget) => void;
  onOpenBookings: (period?: BookingPeriod) => void;
  onOpenBooking: (id: string) => void;
  onSelectVenue: (applicationId: string) => void;
  onSubmit: () => void;
  onOwnerRows: (rows: RestaurantReservation[]) => void;
};

export function CabinetOverviewPanel(props: CabinetOverviewProps) {
  const venueId = props.application.venue_id;
  return venueId ? <LiveOverview key={venueId} venueId={venueId} {...props} /> : <LaunchOverview {...props} />;
}

/* ---------- Published venue: the day ---------- */

function LiveOverview({
  venueId,
  application,
  apps,
  ownerRows,
  venueTitle,
  onOpenSection,
  onOpenBookings,
  onOpenBooking,
  onSelectVenue,
  onOwnerRows,
}: CabinetOverviewProps & { venueId: string }) {
  const text = useOverviewText();
  const { copy, bookings: bcopy, ui, cabinet, locale } = text;
  const now = useClock();
  const { parts, failed, loaded, refreshing, updatedAt, reload } = useVenueDay(venueId, onOwnerRows);
  const rules = useMemo(() => venueRules(parts.venue), [parts.venue]);
  const rows = useMemo(() => ownerRows.filter((row) => row.venue_id === venueId), [ownerRows, venueId]);
  const merged = useMemo(() => mergeBookings(rows, parts.details, rules), [rows, parts.details, rules]);
  const bookingsReady = loaded && !failed.includes("owner");
  const summary = useMemo(() => todaySummary(merged, now, rules.holdMin), [merged, now, rules.holdMin]);
  const hall = parts.tables ? hallNow(parts.tables) : null;
  const team = parts.shifts ? teamDay(parts.shifts, parts.roles ?? [], parts.staff ?? [], now) : null;
  const problems = parts.shifts ? shiftProblems(parts.shifts, now) : null;
  const menuSetup = parts.menu ? venueSetup(parts.menu, []) : null;
  const staffSetup = parts.staff ? venueSetup([], parts.staff) : null;
  const change = parts.changes ? changeState(parts.changes, application.id) : null;
  const presetNames = cabinet.roles.presets as Record<string, string>;
  const items = loaded
    ? attentionItems({
        summary: bookingsReady || rows.length ? summary : null,
        team,
        shiftProblems: problems,
        hall,
        setup: { menu: menuSetup, staff: staffSetup },
        change,
        waiterCalls: parts.analytics?.waiter_calls_pending ?? null,
      })
    : [];
  const today = summary.day;
  const allFailed = loaded && failed.length >= PART_COUNT;

  const partLabels: Partial<Record<PartKey, string>> = {
    owner: copy.partBookings,
    tables: copy.partHall,
    menu: copy.partMenu,
    staff: copy.partTeam,
    shifts: copy.partShifts,
    changes: copy.partModeration,
  };
  const failedLabels = [...new Set(failed.map((key) => partLabels[key]).filter(Boolean))] as string[];

  const dateLine = capitalize(
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: VENUE_TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(now)),
  );

  const upcomingRows = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return summary.upcoming
      .slice(0, GUEST_ROWS)
      .map((b) => byId.get(b.id))
      .filter((row): row is RestaurantReservation => Boolean(row));
  }, [rows, summary.upcoming]);

  const next = summary.next;
  const nextDay = next ? dayKey(expectedAt(next)) : today;

  return (
    <div className="ov-root" aria-busy={!loaded}>
      <div className="ov-daybar">
        <div className="ov-daybar-date">
          <strong>{dateLine}</strong>
          <span>{fill(copy.clock, { time: formatClock(now) })}</span>
        </div>
        <div className="ov-daybar-refresh">
          {updatedAt && (
            <small>{fill(bcopy.updatedAt, { time: formatClock(updatedAt) })}</small>
          )}
          <button
            type="button"
            className="btn btn--secondary btn--sm btn--icon ov-icon-btn"
            onClick={() => void reload()}
            disabled={refreshing}
            aria-label={refreshing ? bcopy.refreshing : bcopy.refresh}
            title={refreshing ? bcopy.refreshing : bcopy.refresh}
          >
            <span className={refreshing ? "ov-spin" : ""}>
              <RefreshIcon />
            </span>
          </button>
        </div>
      </div>

      {allFailed ? (
        <div className="owner-section-empty ov-failed" role="alert">
          <span aria-hidden="true">
            <AlertIcon />
          </span>
          <h3>{copy.loadFailed}</h3>
          <p>{bcopy.loadFailedHint}</p>
          <button type="button" className="btn btn--primary btn--md" onClick={() => void reload()}>
            {ui.retry}
          </button>
        </div>
      ) : (
        <>
          {failedLabels.length > 0 && (
            <div className="ov-partial" role="status">
              <AlertIcon />
              <p>{fill(copy.partialFailed, { list: failedLabels.join(", ") })}</p>
              <button type="button" className="btn btn--link" onClick={() => void reload()} disabled={refreshing}>
                {ui.retry}
              </button>
            </div>
          )}

          <section className="ov-tiles" aria-label={copy.kicker}>
            <button type="button" className="ov-tile" onClick={() => onOpenBookings("today")}>
              <span>{copy.tileToday}</span>
              <strong>{bookingsReady || rows.length ? summary.today.bookings : "—"}</strong>
              <small>
                {summary.today.bookings ? text.count(summary.today.covers, ui.guestsForms) : copy.tileTodayNone}
              </small>
              {summary.preorders > 0 && <small>{text.count(summary.preorders, copy.preordersForms)}</small>}
              {summary.today.cancelled > 0 && <small>{text.count(summary.today.cancelled, bcopy.cancelledForms)}</small>}
            </button>

            <button type="button" className="ov-tile" onClick={() => onOpenBookings("today")}>
              <span>{bcopy.statNow}</span>
              <strong>
                {summary.seated.length}
                {summary.seated.length > 0 && <i className="ov-live-dot" aria-hidden="true" />}
              </strong>
              <small>
                {summary.seated.length ? text.count(summary.seatedGuests, ui.guestsForms) : bcopy.statNowNone}
              </small>
              {hall && hall.tables > 0 && (
                <small>{fill(copy.tileNowTables, { occupied: hall.occupied, tables: hall.tables })}</small>
              )}
            </button>

            {next ? (
              <button type="button" className="ov-tile" onClick={() => onOpenBooking(next.id)}>
                <span>{bcopy.statNext}</span>
                <strong>{formatClock(expectedAt(next))}</strong>
                <small>
                  {[nextDay === today ? "" : relativeDay(text, nextDay, today), next.guestName || bcopy.guestFallback]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                <small>
                  {[
                    next.tableNumbers.length > 1
                      ? fill(bcopy.tablesShort, { list: next.tableNumbers.join(", ") })
                      : next.tableNumbers.length
                        ? fill(bcopy.tableShort, { n: next.tableNumbers[0] })
                        : "",
                    text.count(next.guests, ui.guestsForms),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            ) : (
              <div className="ov-tile">
                <span>{bcopy.statNext}</span>
                <strong>—</strong>
                <small>{bcopy.statNextNone}</small>
              </div>
            )}

            <button type="button" className="ov-tile" onClick={() => onOpenBookings("tomorrow")}>
              <span>{copy.tileTomorrow}</span>
              <strong>{bookingsReady || rows.length ? summary.tomorrowTotals.bookings : "—"}</strong>
              <small>
                {summary.tomorrowTotals.bookings
                  ? text.count(summary.tomorrowTotals.covers, ui.guestsForms)
                  : copy.tileTodayNone}
              </small>
            </button>
          </section>

          <div className="ov-grid">
            <AttentionCard text={text} items={items} loaded={loaded} roles={parts.roles ?? []} staffHref={`/staff?venue=${encodeURIComponent(venueId)}`} onGo={(item) => {
              if (item.target === "reservations") onOpenBookings("today");
              else if (item.target !== "staffPanel") onOpenSection(item.target);
            }} />
            <TeamCard
              text={text}
              loaded={loaded}
              team={team}
              staffCount={staffSetup?.staff ?? null}
              failed={failed.includes("shifts") && !parts.shifts}
              now={now}
              presetNames={presetNames}
              onOpen={() => onOpenSection("shifts")}
              onOpenStaff={() => onOpenSection("staff")}
            />
          </div>

          <section className="owner-card ov-card ov-guests">
            <div className="owner-card-head ov-card-head">
              <div>
                <span className="owner-kicker">{copy.guestsKicker}</span>
                <h3>{copy.guestsTitle}</h3>
              </div>
              <button type="button" className="btn btn--link ov-link" onClick={() => onOpenBookings("upcoming")}>
                {copy.guestsAll}
              </button>
            </div>
            {!loaded && !rows.length ? (
              <Skeleton lines={3} />
            ) : upcomingRows.length === 0 ? (
              <div className="owner-inline-empty ov-empty">
                <span aria-hidden="true">
                  <CalendarIcon />
                </span>
                <p>
                  <strong>{bcopy.emptyUpcoming}</strong>
                  <br />
                  {bcopy.emptyHint}
                </p>
              </div>
            ) : (
              <CabinetBookingsPreview
                rows={upcomingRows}
                details={parts.details}
                rules={rules}
                now={now}
                onOpen={onOpenBooking}
              />
            )}
          </section>

          <div className={`ov-grid${apps.length > 1 ? "" : " is-single"}`}>
            <SetupCard
              text={text}
              loaded={loaded}
              application={application}
              venueId={venueId}
              venue={parts.venue}
              hall={hall}
              menu={menuSetup}
              staff={staffSetup}
              rulesVisit={rules.visitMin}
              onOpenSection={onOpenSection}
            />
            {apps.length > 1 && (
              <VenuesCard
                text={text}
                apps={apps}
                currentId={application.id}
                ownerRows={ownerRows}
                now={now}
                venueTitle={venueTitle}
                onSelect={onSelectVenue}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="ov-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

/* ---------- Attention ---------- */

function attentionTitle(text: Text, item: AttentionItem, roles: VenueRole[]): string {
  const { copy, bookings, cabinet, locale } = text;
  const presetNames = cabinet.roles.presets as Record<string, string>;
  const people = (item.names ?? []).map((name) => name || bookings.guestFallback);
  switch (item.kind) {
    case "changeRejected":
      return copy.changeRejected;
    case "lateGuests":
      return fill(copy.lateGuests, { names: text.names(people) });
    case "shiftSwap":
      return fill(copy.shiftSwap, { names: text.names(people) });
    case "shiftDeclined":
      return fill(copy.shiftDeclined, { names: text.names(people) });
    case "noTables":
      return copy.noTables;
    case "noMenu":
      return copy.noMenu;
    case "noStaff":
      return copy.noStaff;
    case "noShiftsToday":
      return copy.noShiftsToday;
    case "roleUncovered":
      return fill(copy.roleUncovered, {
        names: text.names((item.names ?? []).map((key) => roleNameByKey(key, roles, presetNames))),
      });
    case "waiterCalls":
      return fill(copy.waiterCalls, { n: item.count });
    case "notMarked":
      return fill(copy.notMarked, { names: text.names(people) });
    case "shiftPending":
      return fill(copy.shiftPending, { n: item.count });
    case "changePending":
      return fill(copy.changePending, {
        date: item.at ? formatDay(dayKey(Date.parse(item.at)), locale, { weekday: false }) : "",
      });
    case "staffInvited":
      return fill(copy.staffInvited, { n: item.count });
    case "stopList":
      return fill(copy.stopList, { n: item.count });
  }
}

function goLabel(text: Text, target: AttentionItem["target"]): string {
  const { copy } = text;
  switch (target) {
    case "reservations":
      return copy.goReservations;
    case "shifts":
      return copy.goShifts;
    case "floor":
      return copy.goFloor;
    case "menu":
      return copy.goMenu;
    case "staff":
      return copy.goStaff;
    case "profile":
      return copy.goProfile;
    case "rules":
      return copy.goRules;
    case "staffPanel":
      return copy.goStaffPanel;
  }
}

function AttentionCard({
  text,
  items,
  loaded,
  roles,
  staffHref,
  onGo,
}: {
  text: Text;
  items: AttentionItem[];
  loaded: boolean;
  roles: VenueRole[];
  /** The staff panel opened on this venue (waiter calls wait there). */
  staffHref: string;
  onGo: (item: AttentionItem) => void;
}) {
  const { copy } = text;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, ATTENTION_ROWS);
  const hidden = items.length - shown.length;
  return (
    <section className="owner-card ov-card ov-attention">
      <div className="owner-card-head ov-card-head">
        <div>
          <span className="owner-kicker">{copy.attentionKicker}</span>
          <h3>{copy.attentionTitle}</h3>
        </div>
        {loaded && items.length > 0 && <b className="ov-count">{items.length}</b>}
      </div>
      {!loaded ? (
        <Skeleton lines={3} />
      ) : items.length === 0 ? (
        <div className="ov-all-good">
          <span aria-hidden="true">
            <CheckIcon size={18} />
          </span>
          <p>
            <strong>{copy.allGood}</strong>
            {copy.allGoodHint}
          </p>
        </div>
      ) : (
        <ul className="ov-alerts">
          {shown.map((item) => (
            <li key={item.kind} className={`tone-${item.tone}`}>
              <span className="ov-alert-icon" aria-hidden="true">
                {item.tone === "info" ? <InfoIcon /> : <AlertIcon />}
              </span>
              <div className="ov-alert-text">
                <strong>{attentionTitle(text, item, roles)}</strong>
                {item.kind === "changeRejected" && item.note && <p>{item.note}</p>}
              </div>
              {item.target === "staffPanel" ? (
                <Link className="btn btn--secondary btn--sm ov-go" href={staffHref}>
                  {goLabel(text, item.target)}
                  <ChevronIcon />
                </Link>
              ) : (
                <button type="button" className="btn btn--secondary btn--sm ov-go" onClick={() => onGo(item)}>
                  {goLabel(text, item.target)}
                  <ChevronIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {loaded && items.length > ATTENTION_ROWS && (
        <button type="button" className="btn btn--link ov-link ov-more" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? copy.showLess : fill(copy.showAll, { n: hidden })}
        </button>
      )}
    </section>
  );
}

/* ---------- Team ---------- */

function TeamCard({
  text,
  loaded,
  team,
  staffCount,
  failed,
  now,
  presetNames,
  onOpen,
  onOpenStaff,
}: {
  text: Text;
  loaded: boolean;
  team: ReturnType<typeof teamDay> | null;
  staffCount: number | null;
  failed: boolean;
  now: number;
  presetNames: Record<string, string>;
  onOpen: () => void;
  onOpenStaff: () => void;
}) {
  const { copy } = text;
  const nowMin = minutesIntoDay(now, dayKey(now));
  const shown = team?.shifts.slice(0, TEAM_ROWS) ?? [];
  const more = (team?.shifts.length ?? 0) - shown.length;
  return (
    <section className="owner-card ov-card ov-team">
      <div className="owner-card-head ov-card-head">
        <div>
          <span className="owner-kicker">{copy.teamKicker}</span>
          <h3>{copy.teamTitle}</h3>
        </div>
        <button type="button" className="btn btn--link ov-link" onClick={onOpen}>
          {copy.openSchedule}
        </button>
      </div>
      {!loaded ? (
        <Skeleton lines={3} />
      ) : failed || !team ? (
        <p className="ov-muted">{copy.teamFailed}</p>
      ) : staffCount === 0 && team.shifts.length === 0 ? (
        <div className="ov-team-empty">
          <strong>{copy.teamNoStaff}</strong>
          <p>{copy.teamNoStaffHint}</p>
          <button type="button" className="btn btn--secondary btn--sm ov-go" onClick={onOpenStaff}>
            {copy.goStaff}
            <ChevronIcon />
          </button>
        </div>
      ) : team.shifts.length === 0 ? (
        <div className="ov-team-empty">
          <strong>{copy.teamEmpty}</strong>
          <p>{copy.teamEmptyHint}</p>
        </div>
      ) : (
        <>
          <p className="ov-team-summary">
            <i className={team.onNow ? "ov-live-dot" : "ov-idle-dot"} aria-hidden="true" />
            {fill(copy.teamNow, { now: team.onNow, people: team.people })}
          </p>
          <ul className="ov-shifts">
            {shown.map((shift) => {
              const phase = shiftPhase(shift, nowMin);
              const badge =
                shift.status === "SWAP_REQUESTED"
                  ? { tone: "danger", label: copy.shiftSwapBadge }
                  : shift.status === "PENDING"
                    ? { tone: "warn", label: copy.shiftPendingBadge }
                    : phase === "now"
                      ? { tone: "ok", label: copy.phaseNow }
                      : phase === "later"
                        ? { tone: "muted", label: fill(copy.phaseLater, { time: shift.start_time }) }
                        : { tone: "muted", label: copy.phaseDone };
              return (
                <li key={shift.id} className={phase === "done" ? "is-done" : ""}>
                  <i style={{ background: shift.role_color || "var(--site-muted)" }} aria-hidden="true" />
                  <div>
                    <strong>{shift.staff_name}</strong>
                    <small>
                      {shiftRoleLabel(shift, presetNames)} · {shift.start_time}–{shift.end_time}
                    </small>
                  </div>
                  <span className={`ov-badge tone-${badge.tone}`}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
          {more > 0 && (
            <button type="button" className="btn btn--link ov-link ov-more" onClick={onOpen}>
              {fill(copy.moreShifts, { n: more })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Venue set-up ---------- */

function SetupCard({
  text,
  loaded,
  application,
  venueId,
  venue,
  hall,
  menu,
  staff,
  rulesVisit,
  onOpenSection,
}: {
  text: Text;
  loaded: boolean;
  application: VenueApplication;
  venueId: string;
  venue: Venue | null;
  hall: ReturnType<typeof hallNow> | null;
  menu: ReturnType<typeof venueSetup> | null;
  staff: ReturnType<typeof venueSetup> | null;
  rulesVisit: number;
  onOpenSection: (target: OverviewTarget) => void;
}) {
  const { copy, bookings, count } = text;
  const pending = !loaded;
  const value = (ready: boolean, content: string, warn = false) => ({ content: ready ? content : pending ? "" : copy.unavailable, warn: ready && warn });
  const photos = application.photo_urls?.length ?? 0;
  const step = venue?.booking_interval_min ?? 0;
  const rows: { target: OverviewTarget; label: string; value: { content: string; warn: boolean } }[] = [
    {
      target: "profile",
      label: copy.rowProfile,
      value: value(true, fill(copy.photosValue, { n: photos }), photos === 0),
    },
    {
      target: "floor",
      label: copy.rowFloor,
      value: value(
        Boolean(hall),
        hall?.tables
          ? `${count(hall.tables, copy.tablesForms)} · ${count(hall.seats, bookings.seatsForms)}`
          : copy.notSet,
        hall?.tables === 0,
      ),
    },
    {
      target: "menu",
      label: copy.rowMenu,
      value: value(
        Boolean(menu),
        menu?.dishes
          ? [count(menu.dishes, bookings.dishesForms), menu.stopped ? fill(copy.stoppedValue, { n: menu.stopped }) : ""]
              .filter(Boolean)
              .join(" · ")
          : copy.notSet,
        menu?.dishes === 0,
      ),
    },
    {
      target: "rules",
      label: copy.rowRules,
      value: value(
        Boolean(venue),
        step > 0
          ? fill(copy.rulesValue, { step, visit: text.duration(rulesVisit || DEFAULT_VISIT_MIN) })
          : text.duration(rulesVisit || DEFAULT_VISIT_MIN),
      ),
    },
    {
      target: "staff",
      label: copy.rowStaff,
      value: value(
        Boolean(staff),
        staff && (staff.staff || staff.invited)
          ? [staff.staff ? count(staff.staff, copy.staffForms) : "", staff.invited ? fill(copy.invitedValue, { n: staff.invited }) : ""]
              .filter(Boolean)
              .join(" · ")
          : copy.notSet,
        staff?.staff === 0,
      ),
    },
  ];
  return (
    <section className="owner-card ov-card ov-setup">
      <div className="owner-card-head ov-card-head">
        <div>
          <span className="owner-kicker">{copy.venueKicker}</span>
          <h3>{copy.venueTitle}</h3>
        </div>
      </div>
      <ul className="ov-setup-rows">
        {rows.map((row) => (
          <li key={row.target}>
            <button type="button" onClick={() => onOpenSection(row.target)}>
              <span>{row.label}</span>
              {row.value.content ? (
                <small className={row.value.warn ? "is-warn" : ""}>{row.value.content}</small>
              ) : (
                <i className="ov-skeleton-line" aria-hidden="true" />
              )}
              <ChevronIcon />
            </button>
          </li>
        ))}
      </ul>
      <div className="ov-published">
        <span aria-hidden="true">
          <CheckIcon size={14} />
        </span>
        <p>{copy.publishedNote}</p>
        <Link href={`/venues/${venueId}`} target="_blank" rel="noreferrer" className="btn btn--link ov-link">
          {copy.openPublicPage}
        </Link>
      </div>
    </section>
  );
}

/* ---------- All venues ---------- */

function VenuesCard({
  text,
  apps,
  currentId,
  ownerRows,
  now,
  venueTitle,
  onSelect,
}: {
  text: Text;
  apps: VenueApplication[];
  currentId: string;
  ownerRows: RestaurantReservation[];
  now: number;
  venueTitle: (app: VenueApplication) => string;
  onSelect: (applicationId: string) => void;
}) {
  const { copy, ui, bookings, count } = text;
  const days = useMemo(() => venuesToday(apps, ownerRows, now), [apps, ownerRows, now]);
  return (
    <section className="owner-card ov-card ov-venues">
      <div className="owner-card-head ov-card-head">
        <div>
          <span className="owner-kicker">{copy.venuesKicker}</span>
          <h3>{copy.venuesTitle}</h3>
        </div>
      </div>
      <ul>
        {apps.map((app) => {
          const day = days.find((d) => d.applicationId === app.id);
          const current = app.id === currentId;
          const title = venueTitle(app);
          return (
            <li key={app.id}>
              <button
                type="button"
                className={current ? "active" : ""}
                aria-current={current ? "true" : undefined}
                title={current ? copy.venueCurrent : undefined}
                onClick={() => !current && onSelect(app.id)}
              >
                <i aria-hidden="true">{title.slice(0, 1).toUpperCase()}</i>
                <span className="ov-venue-text">
                  <strong title={title}>{title}</strong>
                  {app.venue_id && day ? (
                    <small>
                      {day.today.bookings
                        ? [
                            count(day.today.bookings, bookings.bookingsForms),
                            count(day.today.covers, ui.guestsForms),
                          ].join(" · ")
                        : copy.venueNoBookings}
                    </small>
                  ) : (
                    <StatusBadge status={app.status} />
                  )}
                </span>
                {!current && <ChevronIcon />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Not published yet: the launch ---------- */

function LaunchOverview({
  application,
  apps,
  ownerRows,
  checks,
  canEdit,
  busy,
  statusHint,
  venueTitle,
  onOpenSection,
  onSelectVenue,
  onSubmit,
}: CabinetOverviewProps) {
  const text = useOverviewText();
  const { copy, cabinet, ui, locale } = text;
  const now = useClock();
  const done = checks.filter((check) => check.done).length;
  const completion = checks.length ? Math.round((done / checks.length) * 100) : 0;
  const stage = launchStage(application.status);
  const rejected = application.status === "REJECTED";
  // A returned application goes back through the profile: the moderator's remarks come first.
  const canSubmit = application.status === "DRAFT" && completion === 100;
  const submittedAt = application.submitted_at ? Date.parse(application.submitted_at) : NaN;

  const steps = [
    {
      key: "profile",
      label: copy.stepProfile,
      hint: rejected
        ? copy.stepFixHint
        : cabinet.completedOf.replace("{done}", String(done)).replace("{total}", String(checks.length)),
      done: stage > 0 || canSubmit,
    },
    {
      key: "submit",
      label: copy.stepSubmit,
      hint:
        stage > 0 && !Number.isNaN(submittedAt)
          ? fill(copy.submittedOn, { date: formatDateTime(submittedAt, locale) })
          : copy.stepSubmitHint,
      done: stage > 0,
    },
    {
      key: "review",
      label: copy.stepReview,
      hint: cabinet.pipelineReviewHint,
      done: stage >= LAUNCH_STAGES.indexOf("APPROVED"),
    },
    { key: "publish", label: copy.stepPublish, hint: copy.stepPublishHint, done: stage >= LAUNCH_STAGES.indexOf("PUBLISHED") },
  ];
  const currentStep = steps.findIndex((step) => !step.done);

  return (
    <div className="ov-root">
      <section className="owner-overview-hero">
        <div>
          <span className="owner-kicker">{ui.preLaunch}</span>
          <h3>{canSubmit ? copy.readyToSubmit : statusHint}</h3>
          <div className="owner-hero-actions">
            {canSubmit && (
              <button type="button" className="btn btn--primary btn--md" disabled={busy} onClick={onSubmit}>
                {copy.submitNow}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className={`btn btn--md ${canSubmit ? "btn--secondary" : "btn--primary"}`}
                onClick={() => onOpenSection("profile")}
              >
                {rejected ? copy.fixAndResubmit : cabinet.continueEditing}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--md" onClick={() => onOpenSection("activity")}>
              {cabinet.checkHistory}
            </button>
          </div>
        </div>
        <div
          className="owner-progress-ring"
          style={{
            background: `conic-gradient(var(--site-accent, #e9b96e) ${completion * 3.6}deg, rgba(255,255,255,.16) 0deg)`,
          }}
          role="img"
          aria-label={`${completion}% ${ui.ready}`}
        >
          <span>
            <strong>{completion}%</strong>
            <small>{ui.ready}</small>
          </span>
        </div>
      </section>

      {application.reject_reason && (
        <div className="owner-review-note ov-reject" role="note">
          <strong>{cabinet.moderatorNote}</strong>
          <p>{application.reject_reason}</p>
        </div>
      )}

      <div className="ov-grid">
        <section className="owner-card owner-checklist-card">
          <div className="owner-card-head">
            <div>
              <span className="owner-kicker">{cabinet.profileReadiness}</span>
              <h3>{cabinet.completedOf.replace("{done}", String(done)).replace("{total}", String(checks.length))}</h3>
            </div>
            <strong>{completion}%</strong>
          </div>
          <div className="owner-progress-bar">
            <i style={{ width: `${completion}%` }} />
          </div>
          <ul>
            {checks.map((check) => (
              <li key={check.label} className={check.done ? "done" : ""}>
                <span>{check.done ? <CheckIcon size={12} /> : null}</span>
                <p>{check.label}</p>
                {!check.done && canEdit && (
                  <button type="button" className="btn btn--link" onClick={() => onOpenSection("profile")}>
                    {cabinet.fillAction}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="owner-card ov-card ov-launch">
          <div className="owner-card-head ov-card-head">
            <div>
              <span className="owner-kicker">{copy.launchKicker}</span>
              <h3>{copy.launchTitle}</h3>
            </div>
          </div>
          <ol className="ov-steps">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className={step.done ? "is-done" : index === currentStep ? (rejected && index === 0 ? "is-current is-rejected" : "is-current") : ""}
                aria-current={index === currentStep ? "step" : undefined}
              >
                <span>{step.done ? <CheckIcon size={12} /> : index + 1}</span>
                <p>
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="owner-card ov-card ov-after">
        <div className="owner-card-head ov-card-head">
          <div>
            <span className="owner-kicker">{copy.afterKicker}</span>
            <h3>{copy.afterTitle}</h3>
          </div>
        </div>
        <p className="ov-muted">{copy.afterHint}</p>
        <ul>
          {[copy.afterBookings, copy.afterFloor, copy.afterMenu, copy.afterRules, copy.afterStaff].map((label) => (
            <li key={label}>
              <LockIcon />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </section>

      {apps.length > 1 && (
        <VenuesCard
          text={text}
          apps={apps}
          currentId={application.id}
          ownerRows={ownerRows}
          now={now}
          venueTitle={venueTitle}
          onSelect={onSelectVenue}
        />
      )}
    </div>
  );
}
