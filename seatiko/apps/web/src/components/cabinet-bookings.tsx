"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  fetchTables,
  fetchVenue,
  listRestaurantReservations,
  pickLocale,
  staffListReservations,
  type Reservation,
  type RestaurantReservation,
  type Table,
} from "@/lib/api";
import { pluralize, type PluralForms } from "@/lib/cabinet-helpers";
import {
  addDays,
  bookingState,
  dayKey,
  daysBetween,
  dayTotals,
  DEFAULT_HOLD_MIN,
  expectedAt,
  DEFAULT_VISIT_MIN,
  filterBookings,
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
  groupByDay,
  isDayPeriod,
  isSeatedNow,
  mergeBookings,
  nextArrival,
  nowMarker,
  periodCounts,
  periodDay,
  periodOrder,
  STATE_TONE,
  timelineRows,
  timelineWindow,
  VENUE_TIME_ZONE,
  venueRules,
  type BookingFilters,
  type BookingPeriod,
  type BookingState,
  type BookingStatusFilter,
  type CabinetBooking,
  type DayTotals,
  type VenueBookingRules,
} from "@/lib/cabinet-bookings";
import { getSiteCopy } from "@/lib/site-copy";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type View = "list" | "timeline";

const PAGE_SIZE = 30;
const POLL_MS = 60_000;
const FOCUS_REFRESH_GAP_MS = 15_000;
const VIEW_STORAGE_KEY = "seatiko:cabinet-bookings-view";
const DEFAULT_RULES: VenueBookingRules = { visitMin: DEFAULT_VISIT_MIN, holdMin: DEFAULT_HOLD_MIN };
const DEFAULT_FILTERS: BookingFilters = { period: "today", status: "all", table: "all", query: "" };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const capitalize = (value: string) => (value ? value[0].toLocaleUpperCase() + value.slice(1) : value);

function readStoredView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "timeline" ? "timeline" : "list";
  } catch {
    return "list";
  }
}

function storeView(view: View) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

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

const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
const RefreshIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Icon>
);
const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <Icon>{dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}</Icon>
);
const NoteIcon = () => (
  <Icon size={14}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);
const DishIcon = () => (
  <Icon size={14}>
    <path d="M3 11h18" />
    <path d="M5 11a7 7 0 0 1 14 0" />
    <path d="M12 4V3" />
    <path d="M4 15h16" />
  </Icon>
);
const ListIcon = () => (
  <Icon>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);
const TimelineIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9h6M10 14h7M3 9h0" />
  </Icon>
);
const CloseIcon = () => (
  <Icon size={18}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
const MailIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon size={20}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);

/* ---------- Shared labels ---------- */

function useBookingText() {
  const { locale } = useLocale();
  const site = useMemo(() => getSiteCopy(locale), [locale]);
  const copy = site.cabinet.bookings;
  const ui = site.cabinet.ui;
  return useMemo(() => {
    const count = (n: number, forms: PluralForms) => `${n} ${pluralize(n, forms, locale)}`;
    const stateLabel = (b: CabinetBooking, state: BookingState) => {
      switch (state) {
        case "confirmed":
          return copy.stateConfirmed;
        case "arrival_confirmed":
          return copy.stateArrivalConfirmed;
        case "due":
          return fill(copy.stateDue, { time: formatClock(b.expectedArrival ?? b.start) });
        case "late":
          return copy.stateLate;
        case "not_marked":
          return copy.stateNotMarked;
        case "arrived":
          return copy.stateArrived;
        case "cancelled":
          return copy.stateCancelled;
        case "no_show":
          return copy.stateNoShow;
        default:
          return b.status;
      }
    };
    const tables = (b: CabinetBooking) =>
      b.tableNumbers.length > 1
        ? fill(copy.tablesShort, { list: b.tableNumbers.join(", ") })
        : b.tableNumbers.length === 1
          ? fill(copy.tableShort, { n: b.tableNumbers[0] })
          : "—";
    const guest = (b: CabinetBooking) => b.guestName || copy.guestFallback;
    const duration = (minutes: number) =>
      formatDuration(minutes, { hours: copy.hoursUnit, minutes: copy.minutesUnit, hoursMinutes: copy.hoursMinutesUnit });
    const totals = (t: DayTotals) => {
      const parts = [count(t.bookings, copy.bookingsForms), count(t.covers, ui.guestsForms)];
      if (t.cancelled) parts.push(count(t.cancelled, copy.cancelledForms));
      return parts.join(" · ");
    };
    const source = (value?: string) => {
      switch (value) {
        case "WEB":
          return copy.sourceWEB;
        case "ANDROID":
          return copy.sourceANDROID;
        case "IOS":
          return copy.sourceIOS;
        case "PHONE":
          return copy.sourcePHONE;
        case "WALK_IN":
          return copy.sourceWALK_IN;
        default:
          return "";
      }
    };
    return { locale, copy, ui, count, stateLabel, tables, guest, duration, totals, source };
  }, [copy, locale, ui]);
}

type Text = ReturnType<typeof useBookingText>;

/** "Сегодня" / "Завтра" / "Вчера" next to the date, or the date alone. */
function dayHeading(text: Text, key: string, today: string) {
  const diff = daysBetween(today, key);
  const relative = diff === 0 ? text.copy.today : diff === 1 ? text.copy.tomorrow : diff === -1 ? text.copy.yesterday : "";
  const date = formatDay(key, text.locale);
  // "Сегодня · чт, 26 ноября", but "Пн, 30 ноября" when the date stands alone.
  return { relative, date: relative ? date : capitalize(date) };
}

function StatusPill({ booking, state, text }: { booking: CabinetBooking; state: BookingState; text: Text }) {
  return <span className={`cb-pill tone-${STATE_TONE[state]}`}>{text.stateLabel(booking, state)}</span>;
}

/* ---------- Booking row ---------- */

function BookingRow({
  booking,
  now,
  holdMin,
  text,
  compact = false,
  dayLabel,
  onOpen,
}: {
  booking: CabinetBooking;
  now: number;
  holdMin: number;
  text: Text;
  compact?: boolean;
  /** Shown above the time when the row is out of its day group (overview). */
  dayLabel?: string;
  onOpen: (id: string) => void;
}) {
  const state = bookingState(booking, now, holdMin);
  const finished = booking.end <= now && state !== "late";
  const closed = state === "cancelled" || state === "no_show";
  const seated = isSeatedNow(booking, now);
  const start = formatClock(booking.start);
  const items = booking.preorder?.items?.reduce((sum, item) => sum + item.qty, 0) ?? 0;
  const className = [
    "cb-row",
    compact ? "is-compact" : "",
    closed ? "is-closed" : finished ? "is-finished" : "",
    seated ? "is-seated" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      data-booking-id={booking.id}
      onClick={() => onOpen(booking.id)}
      aria-haspopup="dialog"
    >
      <span className="cb-row-time">
        {dayLabel && <small className="cb-row-day">{dayLabel}</small>}
        <strong>{start}</strong>
        {/* The overview has no durations, so it shows the start only. */}
        {!compact && <small>–{formatClock(booking.end)}</small>}
      </span>
      <span className="cb-row-table">{text.tables(booking)}</span>
      <span className="cb-row-guest">
        <span className="cb-row-name">
          <strong>{text.guest(booking)}</strong>
          {!compact && items > 0 && (
            <span className="cb-tag is-preorder">
              <DishIcon />
              {text.copy.preorder}
            </span>
          )}
          {!compact && booking.source && booking.source !== "WEB" && (
            <span className="cb-tag">{text.source(booking.source)}</span>
          )}
        </span>
        {!compact && booking.notes ? (
          <span className="cb-row-note">
            <NoteIcon />
            <span>{booking.notes}</span>
          </span>
        ) : booking.guestEmail ? (
          <span className="cb-row-email">{booking.guestEmail}</span>
        ) : null}
      </span>
      <span className="cb-row-party">
        <strong>{booking.guests}</strong>
        <small>{pluralize(booking.guests, text.ui.guestsForms, text.locale)}</small>
      </span>
      <span className="cb-row-status">
        {seated && <i className="cb-live-dot" aria-hidden="true" />}
        <StatusPill booking={booking} state={state} text={text} />
      </span>
    </button>
  );
}

/* ---------- Overview preview ---------- */

/** "Next guests" card of the overview: the first upcoming bookings in the same row style. */
export function CabinetBookingsPreview({
  rows,
  now,
  onOpen,
}: {
  rows: RestaurantReservation[];
  now: number;
  onOpen: (id: string) => void;
}) {
  const text = useBookingText();
  const bookings = useMemo(() => mergeBookings(rows, null, DEFAULT_RULES), [rows]);
  const today = dayKey(now);
  return (
    <div className="cb-list is-compact">
      {bookings.map((booking) => {
        const heading = dayHeading(text, dayKey(booking.start), today);
        return (
          <BookingRow
            key={booking.id}
            booking={booking}
            now={now}
            holdMin={DEFAULT_HOLD_MIN}
            text={text}
            compact
            dayLabel={heading.relative || formatDay(dayKey(booking.start), text.locale, { weekday: false })}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

/* ---------- Detail panel ---------- */

function BookingDetails({
  booking,
  now,
  rules,
  tables,
  text,
  onClose,
  onShowTimeline,
}: {
  booking: CabinetBooking;
  now: number;
  rules: VenueBookingRules;
  tables: Table[];
  text: Text;
  onClose: () => void;
  onShowTimeline: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(true, ref, onClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const { copy, ui, locale } = text;
  const state = bookingState(booking, now, rules.holdMin);
  const today = dayKey(now);
  const day = dayKey(booking.start);
  const heading = dayHeading(text, day, today);
  const seats = booking.tableIds
    .map((id) => tables.find((t) => t.id === id)?.seats ?? 0)
    .reduce((sum, n) => sum + n, 0);
  const preorderItems = booking.preorder?.items ?? [];
  const holdUntil = (booking.expectedArrival && booking.expectedArrival > booking.start ? booking.expectedArrival : booking.start) + rules.holdMin * 60_000;
  const closed = state === "cancelled" || state === "no_show";

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: copy.whenLabel,
      value: (
        <>
          {heading.relative ? `${heading.relative}, ${heading.date}` : heading.date}
          <br />
          <strong>
            {formatClock(booking.start)}–{formatClock(booking.end)}
          </strong>
        </>
      ),
    },
    {
      label: copy.durationLabel,
      value: booking.durationKnown ? text.duration(booking.durationMin) : `${text.duration(booking.durationMin)} · ${copy.durationDefault}`,
    },
    {
      label: copy.tableLabel,
      value: seats ? `${text.tables(booking)} · ${text.count(seats, copy.seatsForms)}` : text.tables(booking),
    },
    { label: copy.partyLabel, value: text.count(booking.guests, ui.guestsForms) },
  ];
  if (booking.source) facts.push({ label: copy.sourceLabel, value: text.source(booking.source) });
  if (booking.createdAt) facts.push({ label: copy.createdLabel, value: formatDateTime(booking.createdAt, locale) });

  const arrival: string[] = [];
  if (!closed && booking.arrivalConfirmedAt) arrival.push(fill(copy.arrivalConfirmedAt, { time: formatClock(booking.arrivalConfirmedAt) }));
  if (!closed && booking.expectedArrival && booking.expectedArrival > booking.start) {
    arrival.push(fill(copy.arrivalDue, { time: formatClock(booking.expectedArrival) }));
  }
  if (state === "late") arrival.push(fill(copy.heldUntil, { time: formatClock(holdUntil) }));

  return createPortal(
    <div className="cb-drawer-root" role="presentation">
      <button type="button" className="cb-drawer-backdrop" aria-label={copy.close} tabIndex={-1} onClick={onClose} />
      <section ref={ref} className="cb-drawer" role="dialog" aria-modal="true" aria-labelledby="cb-drawer-title">
        <header className="cb-drawer-head">
          <div>
            <span className="owner-kicker">{copy.detailTitle}</span>
            <h3 id="cb-drawer-title">{text.guest(booking)}</h3>
            <StatusPill booking={booking} state={state} text={text} />
          </div>
          <button type="button" className="cb-icon-btn" onClick={onClose} aria-label={copy.close} data-autofocus>
            <CloseIcon />
          </button>
        </header>

        <div className="cb-drawer-body">
          <dl className="cb-facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>

          {arrival.length > 0 && (
            <div className="cb-drawer-block">
              <h4>{copy.arrivalLabel}</h4>
              {arrival.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          {booking.notes && (
            <div className="cb-drawer-block is-note">
              <h4>{copy.notesLabel}</h4>
              <p>{booking.notes}</p>
            </div>
          )}

          {preorderItems.length > 0 && booking.preorder && (
            <div className="cb-drawer-block">
              <h4>
                {copy.preorder} · {text.count(preorderItems.reduce((sum, item) => sum + item.qty, 0), copy.dishesForms)}
              </h4>
              <ul className="cb-preorder">
                {preorderItems.map((item) => (
                  <li key={item.menu_item_id} className={item.unavailable ? "is-unavailable" : ""}>
                    <span>
                      {item.qty} × {pickLocale(item.name, locale) || pickLocale(item.name, "ru")}
                    </span>
                    <span>{item.price * item.qty} MDL</span>
                  </li>
                ))}
              </ul>
              <p className="cb-preorder-total">
                <span>{copy.preorderTotal}</span>
                <strong>{booking.preorder.total} MDL</strong>
              </p>
              {booking.preorder.kitchen_at && (
                <p className="cb-muted">{fill(copy.preorderKitchen, { time: formatClock(Date.parse(booking.preorder.kitchen_at)) })}</p>
              )}
            </div>
          )}

          {booking.guestEmail && (
            <div className="cb-drawer-block">
              <h4>{copy.guestLabel}</h4>
              <p className="cb-email">{booking.guestEmail}</p>
            </div>
          )}
        </div>

        <footer className="cb-drawer-foot">
          {booking.guestEmail && (
            <a className="panel-btn ghost cb-btn" href={`mailto:${booking.guestEmail}`}>
              <MailIcon />
              <span>{copy.writeEmail}</span>
            </a>
          )}
          {!closed && (
            <button type="button" className="panel-btn ghost cb-btn" onClick={onShowTimeline}>
              <TimelineIcon />
              <span>{copy.showOnTimeline}</span>
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/* ---------- Timeline ---------- */

function BookingTimeline({
  bookings,
  allDay,
  tables,
  day,
  now,
  holdMin,
  highlightId,
  text,
  onOpen,
}: {
  bookings: CabinetBooking[];
  /** Every booking of the day, so the hours do not jump while filtering. */
  allDay: CabinetBooking[];
  tables: Table[];
  day: string;
  now: number;
  holdMin: number;
  highlightId: string | null;
  text: Text;
  onOpen: (id: string) => void;
}) {
  const window = useMemo(() => timelineWindow(allDay, day), [allDay, day]);
  const rows = useMemo(() => timelineRows(bookings, tables, day, window), [bookings, tables, day, window]);
  const hours = (window.endMin - window.startMin) / 60;
  const marks = Array.from({ length: hours + 1 }, (_, i) => window.startMin / 60 + i);
  const nowAt = nowMarker(now, day, window);
  const hiddenClosed = bookings.some((b) => b.status === "CANCELLED" || b.status === "NO_SHOW");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open with "now" (today) or the first booking a quarter of the way in, not on 10:00.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || node.scrollWidth <= node.clientWidth) return;
    const firstLeft = rows.flatMap((r) => r.blocks.map((b) => b.left)).sort((a, b) => a - b)[0];
    const target = nowAt ?? firstLeft;
    if (target === undefined) return;
    const label = node.querySelector<HTMLElement>(".cb-tl-label")?.offsetWidth ?? 0;
    const track = node.scrollWidth - label;
    const visible = node.clientWidth - label;
    node.scrollLeft = Math.max(0, (target / 100) * track - visible / 4);
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="owner-card cb-timeline">
      <div className="cb-tl-scroll" ref={scrollRef} style={{ ["--cb-hours" as string]: hours }}>
        <div className="cb-tl-grid">
          <div className="cb-tl-head">
            <span className="cb-tl-label">{text.copy.timelineTables}</span>
            <div className="cb-tl-track cb-tl-hours" aria-hidden="true">
              {marks.map((hour, index) => (
                <span key={hour} style={{ left: `${(index / hours) * 100}%` }}>
                  {String(hour % 24).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div className="cb-tl-row" key={row.tableId}>
              <span className="cb-tl-label">
                <strong>{fill(text.copy.tableShort, { n: row.number || "—" })}</strong>
                {row.seats ? <small>{text.count(row.seats, text.copy.seatsForms)}</small> : null}
              </span>
              <div className="cb-tl-track">
                {row.blocks.map((block) => {
                  const b = block.booking;
                  const state = bookingState(b, now, holdMin);
                  // The block shows little text; the label and tooltip carry the whole booking.
                  const details = `${formatClock(b.start)}–${formatClock(b.end)} · ${text.count(b.guests, text.ui.guestsForms)} · ${text.stateLabel(b, state)}`;
                  return (
                    <button
                      key={`${row.tableId}-${b.id}`}
                      type="button"
                      className={`cb-tl-block tone-${STATE_TONE[state]}${b.id === highlightId ? " is-highlight" : ""}${block.clippedEnd ? " is-clipped" : ""}`}
                      style={{ left: `${block.left}%`, width: `${block.width}%` }}
                      onClick={() => onOpen(b.id)}
                      aria-haspopup="dialog"
                      aria-label={`${fill(text.copy.openDetails, { guest: text.guest(b), time: formatClock(b.start) })} · ${details}`}
                      title={`${text.guest(b)} · ${details}`}
                    >
                      <strong>{formatClock(block.booking.start)}</strong>
                      <span>{text.guest(block.booking)}</span>
                      <em>{block.booking.guests}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {nowAt !== null && (
            <div className="cb-tl-now" style={{ ["--cb-now" as string]: nowAt / 100 }} aria-hidden="true">
              <span>{formatClock(now)}</span>
            </div>
          )}
        </div>
      </div>
      {hiddenClosed && <p className="cb-tl-hint">{text.copy.timelineHint}</p>}
    </div>
  );
}

/* ---------- Panel ---------- */

type LoadState = "loading" | "ready" | "error";

export function CabinetBookingsPanel({
  venueId,
  initialRows,
  focusBookingId,
  onFocusHandled,
  onOwnerRows,
}: {
  /** Published venue id. */
  venueId: string;
  /** This venue's rows from the cabinet load, shown while the tab refreshes. */
  initialRows: RestaurantReservation[];
  /** A booking to open right away (from the overview). */
  focusBookingId?: string | null;
  onFocusHandled?: () => void;
  /** Fresh owner rows for every venue, so the sidebar badge and overview stay in step. */
  onOwnerRows?: (rows: RestaurantReservation[]) => void;
}) {
  const text = useBookingText();
  const { copy, ui } = text;
  const [ownerRows, setOwnerRows] = useState<RestaurantReservation[]>(initialRows);
  const [details, setDetails] = useState<Reservation[] | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [rules, setRules] = useState<VenueBookingRules>(DEFAULT_RULES);
  const [loadState, setLoadState] = useState<LoadState>(initialRows.length ? "ready" : "loading");
  const [refreshing, setRefreshing] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filters, setFilters] = useState<BookingFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<View>("list");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const onOwnerRowsRef = useRef(onOwnerRows);

  useEffect(() => {
    onOwnerRowsRef.current = onOwnerRows;
  }, [onOwnerRows]);

  useEffect(() => {
    const stored = readStoredView();
    if (stored !== "list") queueMicrotask(() => setView(stored));
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setRefreshing(true);
    const [owner, venueDetails, venueTables, venue] = await Promise.all([
      listRestaurantReservations().catch(() => null),
      staffListReservations(venueId).catch(() => null),
      fetchTables(venueId).catch(() => null),
      fetchVenue(venueId).catch(() => null),
    ]);
    if (request !== requestRef.current) return;
    setRefreshing(false);
    setNow(Date.now());
    if (venueTables) setTables(venueTables);
    if (venue) setRules(venueRules(venue));
    if (!owner) {
      setRefreshFailed(true);
      setLoadState((current) => (current === "loading" ? "error" : current));
      return;
    }
    setOwnerRows(owner.filter((row) => row.venue_id === venueId));
    onOwnerRowsRef.current?.(owner);
    setDetails(venueDetails);
    setDetailsFailed(venueDetails === null);
    setRefreshFailed(false);
    setUpdatedAt(Date.now());
    setLoadState("ready");
  }, [venueId]);

  // First load, then every minute while the tab is visible and on return to the tab.
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

  // Late / at-the-table states move with the clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const bookings = useMemo(() => mergeBookings(ownerRows, details, rules), [ownerRows, details, rules]);
  const byId = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  // A booking picked on the overview opens once the data is here.
  useEffect(() => {
    if (!focusBookingId || loadState !== "ready") return;
    const target = byId.get(focusBookingId);
    if (target) queueMicrotask(() => setOpenId(target.id));
    onFocusHandled?.();
  }, [byId, focusBookingId, loadState, onFocusHandled]);

  const today = dayKey(now);
  const counts = useMemo(() => periodCounts(bookings, now), [bookings, now]);
  const filtered = useMemo(() => filterBookings(bookings, filters, now), [bookings, filters, now]);
  const dayKeyOfPeriod = periodDay(filters, now);
  const dayAll = useMemo(
    () => (dayKeyOfPeriod ? bookings.filter((b) => dayKey(b.start) === dayKeyOfPeriod) : []),
    [bookings, dayKeyOfPeriod],
  );

  const todayList = useMemo(() => bookings.filter((b) => dayKey(b.start) === today), [bookings, today]);
  const todayTotals = dayTotals(todayList);
  const tomorrowTotals = dayTotals(bookings.filter((b) => dayKey(b.start) === addDays(today, 1)));
  const seatedNow = todayList.filter((b) => isSeatedNow(b, now));
  const next = nextArrival(todayList, now);
  const showTimeline = view === "timeline" && dayKeyOfPeriod !== null;
  const filtersActive = filters.status !== "all" || filters.table !== "all" || filters.query.trim() !== "";
  const openBooking = openId ? byId.get(openId) ?? null : null;
  const viewerZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return VENUE_TIME_ZONE;
    }
  }, []);

  const update = (patch: Partial<BookingFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setVisible(PAGE_SIZE);
  };

  // Multi-day periods always read as a list; the timeline choice is kept for the next day view.
  const setPeriod = (period: BookingPeriod) => update({ period, day: undefined });

  /** Period filters that show one venue day ("today" / "tomorrow" keep following the clock). */
  const dayPeriod = (key: string): Pick<BookingFilters, "period" | "day"> =>
    key === today
      ? { period: "today", day: undefined }
      : key === addDays(today, 1)
        ? { period: "tomorrow", day: undefined }
        : { period: "day", day: key };

  const goToDay = (key: string) => update(dayPeriod(key));

  const changeView = (next: View) => {
    setView(next);
    storeView(next);
    if (next === "timeline" && !isDayPeriod(filters.period)) update({ period: "today", day: undefined });
  };

  const showOnTimeline = (booking: CabinetBooking) => {
    setOpenId(null);
    setView("timeline");
    storeView("timeline");
    update({ ...dayPeriod(dayKey(booking.start)), status: "all", table: "all", query: "" });
    setHighlightId(booking.id);
  };

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const tableOptions = useMemo(() => {
    const known = new Map<string, { id: string; number: number; seats?: number }>();
    for (const table of tables) known.set(table.id, table);
    for (const b of bookings) {
      b.tableIds.forEach((id, index) => {
        if (!known.has(id)) known.set(id, { id, number: b.tableNumbers[index] ?? 0 });
      });
    }
    const sorted = [...known.values()].sort((a, b) => a.number - b.number);
    return [
      { value: "all", label: copy.allTables },
      ...sorted.map((table) => ({
        value: table.id,
        label: table.seats
          ? `${fill(copy.tableOption, { n: table.number || "—" })} · ${text.count(table.seats, copy.seatsForms)}`
          : fill(copy.tableOption, { n: table.number || "—" }),
      })),
    ];
  }, [bookings, copy, tables, text]);

  const statusOptions: { value: BookingStatusFilter; label: string }[] = [
    { value: "all", label: copy.allStatuses },
    { value: "active", label: copy.activeStatuses },
    { value: "CONFIRMED", label: copy.stateConfirmed },
    { value: "CHECKED_IN", label: copy.stateArrived },
    { value: "CANCELLED", label: copy.stateCancelled },
    { value: "NO_SHOW", label: copy.stateNoShow },
  ];

  const chips: { id: BookingPeriod; label: string; count: number }[] = [
    { id: "today", label: copy.today, count: counts.today },
    { id: "tomorrow", label: copy.tomorrow, count: counts.tomorrow },
    { id: "upcoming", label: copy.upcoming, count: counts.upcoming },
    { id: "past", label: copy.past, count: counts.past },
    { id: "all", label: copy.all, count: counts.all },
  ];

  const emptyTitle = (() => {
    if (filtersActive) return copy.emptyFiltered;
    switch (filters.period) {
      case "today":
        return copy.emptyToday;
      case "tomorrow":
        return copy.emptyTomorrow;
      case "day":
        return copy.emptyDay;
      case "upcoming":
        return copy.emptyUpcoming;
      case "past":
        return copy.emptyPast;
      default:
        return copy.emptyAll;
    }
  })();

  if (loadState === "loading") {
    return (
      <section className="owner-reservations cb-panel">
        <div className="owner-section-empty" role="status">
          <span className="owner-inline-spinner" aria-hidden="true" />
          <p>{copy.loading}</p>
        </div>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="owner-reservations cb-panel">
        <div className="owner-section-empty" role="alert">
          <span aria-hidden="true">
            <CalendarIcon />
          </span>
          <h3>{copy.loadFailed}</h3>
          <p>{copy.loadFailedHint}</p>
          <button
            type="button"
            className="panel-btn cb-btn"
            onClick={() => {
              setLoadState("loading");
              void load();
            }}
          >
            {ui.retry}
          </button>
        </div>
      </section>
    );
  }

  const shown = isDayPeriod(filters.period) ? filtered : filtered.slice(0, visible);
  const groups = groupByDay(shown, periodOrder(filters.period));
  const dayHead = dayKeyOfPeriod ? dayHeading(text, dayKeyOfPeriod, today) : null;

  return (
    <section className="owner-reservations cb-panel" aria-busy={refreshing}>
      <div className="cb-stats">
        <button type="button" className={`cb-stat${filters.period === "today" ? " active" : ""}`} onClick={() => setPeriod("today")}>
          <span>{copy.today}</span>
          <strong>{todayTotals.bookings}</strong>
          <small>{text.count(todayTotals.covers, ui.guestsForms)}</small>
        </button>
        <div className="cb-stat">
          <span>{copy.statNow}</span>
          <strong>
            {seatedNow.length}
            {seatedNow.length > 0 && <i className="cb-live-dot" aria-hidden="true" />}
          </strong>
          <small>
            {seatedNow.length
              ? text.count(seatedNow.reduce((sum, b) => sum + b.guests, 0), ui.guestsForms)
              : copy.statNowNone}
          </small>
        </div>
        {next ? (
          <button type="button" className="cb-stat" onClick={() => setOpenId(next.id)}>
            <span>{copy.statNext}</span>
            <strong>{formatClock(expectedAt(next))}</strong>
            <small>
              {text.guest(next)} · {text.tables(next)}
            </small>
          </button>
        ) : (
          <div className="cb-stat">
            <span>{copy.statNext}</span>
            <strong>—</strong>
            <small>{copy.statNextNone}</small>
          </div>
        )}
        <button
          type="button"
          className={`cb-stat${filters.period === "tomorrow" ? " active" : ""}`}
          onClick={() => setPeriod("tomorrow")}
        >
          <span>{copy.tomorrow}</span>
          <strong>{tomorrowTotals.bookings}</strong>
          <small>{text.count(tomorrowTotals.covers, ui.guestsForms)}</small>
        </button>
      </div>

      <div className="cb-toolbar" role="search" aria-label={copy.filtersLabel}>
        <div className="cb-chips" role="group" aria-label={copy.periodLabel}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={filters.period === chip.id ? "active" : ""}
              aria-pressed={filters.period === chip.id}
              onClick={() => setPeriod(chip.id)}
            >
              {chip.label}
              <b>{chip.count}</b>
            </button>
          ))}
        </div>

        <div className="cb-controls">
          <label className="cb-search">
            <SearchIcon />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchLabel}
            />
            {filters.query && (
              <button type="button" onClick={() => update({ query: "" })} aria-label={copy.clearSearch}>
                <CloseIcon />
              </button>
            )}
          </label>
          <SelectMenu
            value={filters.table}
            onChange={(value) => update({ table: value })}
            options={tableOptions}
            ariaLabel={copy.tableFilter}
            className="cb-select"
          />
          <SelectMenu
            value={filters.status}
            onChange={(value) => update({ status: value as BookingStatusFilter })}
            options={statusOptions}
            ariaLabel={copy.statusFilter}
            className="cb-select"
          />
          <div className="cb-view" role="group" aria-label={copy.viewLabel}>
            <button type="button" className={!showTimeline ? "active" : ""} aria-pressed={!showTimeline} onClick={() => changeView("list")}>
              <ListIcon />
              <span>{copy.viewList}</span>
            </button>
            <button type="button" className={showTimeline ? "active" : ""} aria-pressed={showTimeline} onClick={() => changeView("timeline")}>
              <TimelineIcon />
              <span>{copy.viewTimeline}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="cb-status-row">
        {dayHead && dayKeyOfPeriod ? (
          <div className="cb-day-nav">
            <button type="button" className="cb-icon-btn" onClick={() => goToDay(addDays(dayKeyOfPeriod, -1))} aria-label={copy.prevDay}>
              <ChevronIcon dir="left" />
            </button>
            <p>
              {dayHead.relative && <strong>{dayHead.relative}</strong>}
              <span>{dayHead.date}</span>
            </p>
            <button type="button" className="cb-icon-btn" onClick={() => goToDay(addDays(dayKeyOfPeriod, 1))} aria-label={copy.nextDay}>
              <ChevronIcon dir="right" />
            </button>
            <small className="cb-day-totals">{text.totals(dayTotals(filtered))}</small>
          </div>
        ) : (
          <p className="cb-day-totals">{text.totals(dayTotals(filtered))}</p>
        )}
        <div className="cb-refresh">
          <span aria-live="polite">
            {refreshing ? copy.refreshing : updatedAt ? fill(copy.updatedAt, { time: formatClock(updatedAt) }) : ""}
          </span>
          <button type="button" className="cb-icon-btn" onClick={() => void load()} disabled={refreshing} aria-label={copy.refresh} title={copy.refresh}>
            <span className={refreshing ? "cb-spin" : ""}>
              <RefreshIcon />
            </span>
          </button>
        </div>
      </div>

      {(refreshFailed || detailsFailed || viewerZone !== VENUE_TIME_ZONE) && (
        <div className="cb-notes">
          {refreshFailed && updatedAt && (
            <p className="cb-note is-warn" role="alert">
              {fill(copy.refreshFailed, { time: formatClock(updatedAt) })}
            </p>
          )}
          {detailsFailed && <p className="cb-note">{copy.detailsUnavailable}</p>}
          {viewerZone !== VENUE_TIME_ZONE && <p className="cb-note">{copy.timezoneNote}</p>}
        </div>
      )}

      {filtered.length === 0 && !(showTimeline && tables.length > 0 && !filtersActive) ? (
        <div className="owner-section-empty cb-empty">
          <span aria-hidden="true">
            <CalendarIcon />
          </span>
          <h3>{emptyTitle}</h3>
          <p>{filtersActive ? copy.emptyFilteredHint : copy.emptyHint}</p>
          {filtersActive ? (
            <button type="button" className="panel-btn ghost cb-btn" onClick={() => update({ status: "all", table: "all", query: "" })}>
              {copy.resetFilters}
            </button>
          ) : (
            isDayPeriod(filters.period) &&
            counts.upcoming > 0 && (
              <button type="button" className="panel-btn ghost cb-btn" onClick={() => setPeriod("upcoming")}>
                {copy.showUpcoming} · {counts.upcoming}
              </button>
            )
          )}
        </div>
      ) : showTimeline && dayKeyOfPeriod ? (
        <BookingTimeline
          bookings={filtered}
          allDay={dayAll}
          tables={filters.table === "all" && !filters.query.trim() ? tables : []}
          day={dayKeyOfPeriod}
          now={now}
          holdMin={rules.holdMin}
          highlightId={highlightId}
          text={text}
          onOpen={setOpenId}
        />
      ) : (
        <div className="cb-groups">
          {groups.map((group) => {
            const heading = dayHeading(text, group.day, today);
            const nowIndex = group.day === today ? group.bookings.findIndex((b) => b.start > now) : -1;
            return (
              <section key={group.day} className="cb-group" aria-label={heading.relative || heading.date}>
                {!isDayPeriod(filters.period) && (
                  <header className="cb-group-head">
                    <h3>
                      {heading.relative && <strong>{heading.relative}</strong>}
                      <span>{heading.date}</span>
                    </h3>
                    <small>{text.totals(group.totals)}</small>
                  </header>
                )}
                <div className="owner-card cb-list">
                  {group.bookings.map((booking, index) => (
                    <div key={booking.id} className="cb-list-item">
                      {index === nowIndex && nowIndex > 0 && (
                        <div className="cb-now-divider" aria-hidden="true">
                          <span>
                            {copy.nowBadge} · {formatClock(now)}
                          </span>
                        </div>
                      )}
                      <BookingRow booking={booking} now={now} holdMin={rules.holdMin} text={text} onOpen={setOpenId} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!isDayPeriod(filters.period) && filtered.length > shown.length && (
            <button type="button" className="panel-btn ghost cb-btn cb-more" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
              {fill(copy.showMore, { n: Math.min(PAGE_SIZE, filtered.length - shown.length) })}
            </button>
          )}
        </div>
      )}

      {openBooking && (
        <BookingDetails
          booking={openBooking}
          now={now}
          rules={rules}
          tables={tables}
          text={text}
          onClose={() => setOpenId(null)}
          onShowTimeline={() => showOnTimeline(openBooking)}
        />
      )}
    </section>
  );
}
