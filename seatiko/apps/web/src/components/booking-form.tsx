"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ApiError,
  createReservation,
  fetchReservations,
  fetchVenueSchedule,
  getToken,
  pickLocale,
  type Table,
  type Venue,
  type VenueScheduleSlot,
} from "@/lib/api";
import { apiErrorKey } from "@/lib/api-error-message";
import {
  BOOKING_DAYS_AHEAD,
  DEFAULT_SLOT_STEP_MIN,
  addLocalDays,
  buildAnyTableSlots,
  groupSlotsByDayPart,
  startOfLocalDay,
  type DayPartId,
} from "@/lib/booking-slots";
import { venueOpeningHours } from "@/lib/venue-hours";
import { durationOptions, resolveBookingRules } from "@/lib/venue-rules";
import { BookingRulesNote } from "@/components/booking-rules-note";
import { VenueBookingRules } from "@/components/venue-booking-rules";
import { AuthForm } from "@/components/auth-form";
import { BookingConfirmation, type BookedReservation } from "@/components/booking-confirmation";
import { useLocale, type MessageKey } from "@/components/locale-provider";

const DAY_PART_LABEL: Record<DayPartId, MessageKey> = {
  morning: "res.period_morning",
  lunch: "res.period_lunch",
  evening: "res.period_evening",
  late: "res.period_late",
};
const ACTIVE_STATUSES = new Set(["PENDING", "CONFIRMED", "CHECKED_IN"]);

/** Day index (0 = today) of `target`, or null when outside the booking window. */
function dayOffsetFrom(now: Date, target: Date): number | null {
  if (Number.isNaN(target.getTime())) return null;
  const days = Math.round(
    (startOfLocalDay(target).getTime() - startOfLocalDay(now).getTime()) / 86_400_000,
  );
  return days >= 0 && days < BOOKING_DAYS_AHEAD ? days : null;
}

export type BookingFormProps = {
  venue: Venue;
  /** A specific table, or null to pick any free table that fits. */
  table: Table | null;
  /** Second table pushed together with `table` for a group booking. */
  extraTable?: Table | null;
  /** All venue tables (used when `table` is null). */
  tables?: Table[];
  variant: "popup" | "inline";
  titleId?: string;
  /** Popup: the × button and "Close" after success. */
  onClose?: () => void;
  onBooked?: () => void;
  /** Inline: drop the chosen table and go back to "any table". */
  onClearTable?: () => void;
  /** Inline: optional wishes field. */
  showNotes?: boolean;
  /** Inline: extra actions under the success message. */
  doneActions?: ReactNode;
  /** Shown under the confirm button (e.g. pre-order link). */
  footer?: ReactNode;
  /** Prefill from a deep link / search: party size, start time (ISO), length. */
  initialGuests?: number | null;
  initialTime?: string | null;
  initialDurationMin?: number | null;
};

/** Booking flow (guests, duration, day, time, rules, sign-in) used in the popup and inline on /book. */
export function BookingForm({
  venue,
  table,
  extraTable = null,
  tables = [],
  variant,
  titleId = "booking-form-title",
  onClose,
  onBooked,
  onClearTable,
  showNotes = false,
  doneActions,
  footer,
  initialGuests,
  initialTime,
  initialDurationMin,
}: BookingFormProps) {
  const { locale, t } = useLocale();
  const quick = table === null;
  const combined = table && extraTable ? [table, extraTable] : null;
  const maxGuests = combined
    ? combined[0].seats + combined[1].seats
    : table
      ? table.seats
      : Math.max(1, ...tables.map((tb) => tb.seats));
  const [guestsWanted, setGuests] = useState(initialGuests ?? 2);
  const guests = Math.max(1, Math.min(guestsWanted, maxGuests));
  const [notes, setNotes] = useState("");
  const [schedule, setSchedule] = useState<VenueScheduleSlot[]>([]);
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const [now] = useState(() => new Date());
  const [dayOffset, setDayOffset] = useState<number | null>(() =>
    initialTime ? dayOffsetFrom(now, new Date(initialTime)) : null,
  );
  const [slotIso, setSlotIso] = useState<string | null>(initialTime ?? null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [activeResId, setActiveResId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [booked, setBooked] = useState<BookedReservation | null>(null);
  const [chosenDuration, setChosenDuration] = useState<number | null>(initialDurationMin ?? null);

  const hours = useMemo(
    () => venueOpeningHours({ id: venue.id, hours_text: venue.hours_text }),
    [venue.id, venue.hours_text],
  );
  const rules = useMemo(() => resolveBookingRules(venue), [venue]);
  const stepMin = rules.booking_interval_min || DEFAULT_SLOT_STEP_MIN;
  const durations = useMemo(() => durationOptions(rules), [rules]);
  const durationMin =
    chosenDuration && durations.includes(chosenDuration) ? chosenDuration : rules.visit_duration_min;

  const candidates = useMemo(() => {
    const busyOf = (id: string) => schedule.filter((slot) => slot.table_id === id);
    if (combined) {
      return [
        {
          id: combined[0].id,
          seats: combined[0].seats + combined[1].seats,
          busy: [...busyOf(combined[0].id), ...busyOf(combined[1].id)],
        },
      ];
    }
    const pool = table
      ? [table]
      : tables
          .filter((tb) => tb.seats >= guests)
          .sort(
            (a, b) =>
              a.seats - b.seats ||
              Number(b.status === "FREE") - Number(a.status === "FREE") ||
              a.number - b.number,
          );
    return pool.map((tb) => ({ id: tb.id, seats: tb.seats, busy: busyOf(tb.id) }));
    // combined is derived from table/extraTable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, extraTable, tables, guests, schedule]);

  const days = useMemo(() => {
    const today = startOfLocalDay(now);
    return Array.from({ length: BOOKING_DAYS_AHEAD }, (_, offset) => {
      const day = addLocalDays(today, offset);
      const slots = buildAnyTableSlots({ day, now, hours, stepMin, durationMin, candidates });
      return { offset, day, slots, hasFree: slots.some((slot) => slot.available) };
    });
  }, [now, hours, stepMin, durationMin, candidates]);

  const activeOffset = dayOffset ?? days.find((d) => d.hasFree)?.offset ?? 0;
  const activeDay = days[activeOffset];
  const firstFreeIso = activeDay.slots.find((slot) => slot.available)?.start.toISOString() ?? null;
  const selectedIso =
    slotIso && activeDay.slots.some((s) => s.available && s.start.toISOString() === slotIso)
      ? slotIso
      : firstFreeIso;
  const selectedDate = selectedIso ? new Date(selectedIso) : null;
  const chosenTables: Table[] = combined
    ? combined
    : table
      ? [table]
      : (() => {
          const id = activeDay.slots.find((s) => s.start.toISOString() === selectedIso)?.tableId;
          const found = tables.find((tb) => tb.id === id);
          return found ? [found] : [];
        })();

  useEffect(() => {
    let alive = true;
    fetchVenueSchedule(venue.id)
      .then((slots) => {
        if (alive) setSchedule(slots);
      })
      .catch(() => {
        if (alive) setSchedule([]);
      });
    return () => {
      alive = false;
    };
  }, [venue.id, scheduleVersion]);

  const venueName = pickLocale(venue.name, locale);
  const formatDuration = (min: number) =>
    min % 30 === 0 && min >= 60
      ? t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) })
      : t("res.duration_minutes", { min });
  const formatClock = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (offset: number, day: Date) => {
    if (offset === 0) return t("res.today");
    if (offset === 1) return t("res.tomorrow");
    return day.toLocaleDateString(locale, { weekday: "short", day: "numeric" });
  };
  const tablesLabel = (list: Table[]) =>
    list.length === 2
      ? t("res.tables_combined", { a: list[0].number, b: list[1].number, seats: list[0].seats + list[1].seats })
      : list[0]
        ? t(quick ? "res.table_picked" : "res.table_value", { n: list[0].number, seats: list[0].seats })
        : t("res.table_auto");

  async function book() {
    setErrorKey(null);
    if (!selectedIso || chosenTables.length === 0) {
      setErrorKey(candidates.length === 0 ? "res.no_table_for_guests" : "res.no_slots");
      return;
    }
    if (!getToken()) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      const created = await createReservation({
        venue_id: venue.id,
        table_id: chosenTables[0].id,
        table_ids: chosenTables.length > 1 ? chosenTables.map((tb) => tb.id) : undefined,
        guests,
        reserved_for: selectedIso,
        duration_min: durationMin,
        notes: notes.trim() || undefined,
      });
      setBooked({
        id: created.id,
        tables: chosenTables,
        at: new Date(selectedIso),
        duration: durationMin,
        guests,
        notes: notes.trim(),
      });
      setDone(true);
      onBooked?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthOpen(true);
      } else {
        const key = apiErrorKey(e);
        setErrorKey(key);
        if (key === "error.active_reservation") {
          void fetchReservations()
            .then((list) => {
              const active = list.find((r) => ACTIVE_STATUSES.has(r.status));
              setActiveResId(active?.id ?? null);
            })
            .catch(() => setActiveResId(null));
        } else {
          setScheduleVersion((v) => v + 1);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function bookAnother() {
    setDone(false);
    setBooked(null);
    setSlotIso(null);
    setNotes("");
    setScheduleVersion((v) => v + 1);
  }

  if (done && booked) {
    return (
      <div className={`booking-form booking-form-${variant}`}>
        <BookingConfirmation
          booked={booked}
          venue={venue}
          venueName={venueName}
          rules={rules}
          variant={variant}
          titleId={titleId}
          formatDuration={formatDuration}
          onClose={onClose}
          onBookAgain={bookAnother}
          onCancelled={onBooked}
          extraActions={doneActions}
        />
      </div>
    );
  }

  return (
    <div className={`booking-form booking-form-${variant}`}>
      <header className="booking-popup-head">
        <div>
          <p className="venue-page-kicker">{quick ? t("book.kicker") : t("venue.book")}</p>
          <h2 id={titleId}>{quick ? t("res.quick_title") : t("res.confirm_title")}</h2>
          <p className="web-book-muted">
            {quick ? t("res.quick_subtitle", { venue: venueName }) : venueName}
          </p>
        </div>
        {variant === "popup" && onClose ? (
          <button
            type="button"
            className="booking-popup-x"
            onClick={onClose}
            aria-label={t("res.close")}
          >
            ×
          </button>
        ) : null}
      </header>

      <div className="booking-popup-body">
        <div className="booking-field">
          <span className="booking-field-label">{t("res.table")}</span>
          <div className="booking-table-row">
            <p className={`booking-table-value${chosenTables.length ? "" : " auto"}`}>
              {tablesLabel(chosenTables)}
            </p>
            {!quick && onClearTable ? (
              <button type="button" className="booking-table-clear" onClick={onClearTable}>
                {t("res.change_table")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="booking-field">
          <label className="booking-field-label" htmlFor={`${titleId}-guests`}>
            {t("res.guests")}
          </label>
          <div className="booking-stepper">
            <button
              type="button"
              aria-label={t("res.guests_less")}
              disabled={guests <= 1}
              onClick={() => setGuests(Math.max(1, guests - 1))}
            >
              −
            </button>
            <input
              id={`${titleId}-guests`}
              type="number"
              inputMode="numeric"
              min={1}
              max={maxGuests}
              value={guests}
              onChange={(e) =>
                setGuests(Math.max(1, Math.min(maxGuests, Number(e.target.value) || 1)))
              }
            />
            <button
              type="button"
              aria-label={t("res.guests_more")}
              disabled={guests >= maxGuests}
              onClick={() => setGuests(Math.min(maxGuests, guests + 1))}
            >
              +
            </button>
          </div>
        </div>

        {table && table.status !== "FREE" && (
          <p className="booking-busy-hint">{t("res.busy_now_hint")}</p>
        )}

        <fieldset className="booking-slots">
          <legend>{t("res.duration")}</legend>
          <div className="booking-slot-days">
            {durations.map((min) => (
              <button
                key={min}
                type="button"
                className={min === durationMin ? "on" : ""}
                aria-pressed={min === durationMin}
                onClick={() => {
                  setChosenDuration(min);
                  setSlotIso(null);
                }}
              >
                {formatDuration(min)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="booking-slots">
          <legend>{t("res.day")}</legend>
          <div className="booking-slot-days">
            {days.map(({ offset, day, hasFree }) => (
              <button
                key={offset}
                type="button"
                className={offset === activeOffset ? "on" : ""}
                aria-pressed={offset === activeOffset}
                disabled={!hasFree}
                onClick={() => {
                  setDayOffset(offset);
                  setSlotIso(null);
                }}
              >
                {dayLabel(offset, day)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="booking-slots">
          <legend>{t("res.time")}</legend>
          {activeDay.hasFree ? (
            <div className="booking-slot-time-groups">
              {groupSlotsByDayPart(activeDay.slots).map((group) => (
                <div key={group.id} className="booking-slot-period">
                  <p className="booking-slot-period-label">{t(DAY_PART_LABEL[group.id])}</p>
                  <div className="booking-slot-times" role="group" aria-label={t(DAY_PART_LABEL[group.id])}>
                    {group.slots.map((slot) => {
                      const iso = slot.start.toISOString();
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={iso === selectedIso ? "on" : ""}
                          aria-pressed={iso === selectedIso}
                          disabled={!slot.available}
                          onClick={() => setSlotIso(iso)}
                        >
                          {formatClock(slot.start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="web-book-muted">
              {candidates.length === 0 ? t("res.no_table_for_guests") : t("res.no_slots")}
            </p>
          )}
        </fieldset>

        {showNotes ? (
          <label className="booking-field booking-notes">
            <span className="booking-field-label">{t("res.notes")}</span>
            <textarea
              rows={2}
              maxLength={300}
              placeholder={t("res.notes_placeholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        ) : null}

        <BookingRulesNote rules={rules} />
        <details className="booking-rules-details">
          <summary>{t("venue.rules_title")}</summary>
          <VenueBookingRules rules={rules} allowPreorder={venue.allow_preorder !== false} compact />
        </details>
        {errorKey && (
          <div className="web-book-error booking-form-error" role="alert">
            <p>{t(errorKey)}</p>
            {errorKey === "error.active_reservation" ? (
              <Link
                className="venue-cta venue-cta-outline booking-form-error-link"
                href={
                  activeResId
                    ? `/account?reservation=${encodeURIComponent(activeResId)}`
                    : "/account"
                }
              >
                {t("res.open_active_booking")}
              </Link>
            ) : null}
          </div>
        )}
        <button
          type="button"
          className="venue-cta venue-cta-primary"
          disabled={busy || !selectedIso}
          onClick={() => void book()}
        >
          {busy
            ? t("res.booking")
            : selectedDate
              ? t("res.confirm_book_at", { time: formatClock(selectedDate) })
              : t("res.confirm_book")}
        </button>
        {footer}
        <p className="web-book-muted tiny">{t("res.account_hint")}</p>
      </div>

      {authOpen && (
        <AuthForm
          initialMode="register"
          onCancel={() => setAuthOpen(false)}
          onSuccess={() => {
            setAuthOpen(false);
            void book();
          }}
        />
      )}
    </div>
  );
}
