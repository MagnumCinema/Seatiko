"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { sameDay as sameLocalDay } from "@/lib/date-picker";
import { venueHoursOn } from "@/lib/venue-hours";
import { durationOptions, resolveBookingRules } from "@/lib/venue-rules";
import { BookingRulesNote } from "@/components/booking-rules-note";
import { VenueBookingRules } from "@/components/venue-booking-rules";
import { AuthForm } from "@/components/auth-form";
import { BookingConfirmation, type BookedReservation } from "@/components/booking-confirmation";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { ModalBody, ModalClose, ModalFooter, ModalHeader } from "@/components/ui/modal-shell";
import { ScrollerFade } from "@/components/ui/scroller-fade";

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
  /** Step 2 of 2 for a guest who is not signed in: sign-in inside the popup, the slot is kept. */
  const [step, setStep] = useState<"pick" | "auth">("pick");
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const [booked, setBooked] = useState<BookedReservation | null>(null);
  const [chosenDuration, setChosenDuration] = useState<number | null>(initialDurationMin ?? null);

  // The sign-in step takes focus; a refusal is brought into view inside the scrolling body.
  const authRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== "auth") return;
    const box = authRef.current;
    box?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    box?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (errorKey) errorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [errorKey]);

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
    const own = { id: venue.id, hours_text: venue.hours_text };
    return Array.from({ length: BOOKING_DAYS_AHEAD }, (_, offset) => {
      const day = addLocalDays(today, offset);
      // Each day by the venue's own hours (days off, closing after midnight); no slots on a day off.
      const hours = venueHoursOn(own, day);
      const slots = hours ? buildAnyTableSlots({ day, now, hours, stepMin, durationMin, candidates }) : [];
      return { offset, day, slots, closed: !hours, hasFree: slots.some((slot) => slot.available) };
    });
  }, [now, venue.id, venue.hours_text, stepMin, durationMin, candidates]);

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
  const shortDay = (d: Date) =>
    sameLocalDay(d, now)
      ? t("res.today")
      : sameLocalDay(d, addLocalDays(now, 1))
        ? t("res.tomorrow")
        : d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const tablesLabel = (list: Table[]) =>
    list.length === 2
      ? t("res.tables_combined", { a: list[0].number, b: list[1].number, seats: list[0].seats + list[1].seats })
      : list[0]
        ? t(quick ? "res.table_picked" : "res.table_value", { n: list[0].number, seats: list[0].seats })
        : t("res.table_auto");
  /** "Стол №1 · гостей: 2 · Сегодня, 12:00": the choice in one line (footer, sign-in step). */
  const summary = [
    chosenTables.length
      ? t("booking.summary_table", { n: chosenTables.map((tb) => tb.number).join("+") })
      : null,
    t("booking.summary_guests", { n: guests }),
    selectedDate ? `${shortDay(selectedDate)}, ${formatClock(selectedDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function book() {
    setErrorKey(null);
    if (!selectedIso || chosenTables.length === 0) {
      setErrorKey(candidates.length === 0 ? "res.no_table_for_guests" : activeDay.closed ? "res.closed_day" : "res.no_slots");
      return;
    }
    if (!getToken()) {
      setSignedIn(false);
      setStep("auth");
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
        setSignedIn(false);
        setStep("auth");
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
      <div className={`booking-form booking-form-${variant} mshell-content`}>
        {variant === "popup" && onClose ? <ModalClose onClose={onClose} className="mshell-float-x" /> : null}
        <ModalBody className="booking-done-body">
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
        </ModalBody>
      </div>
    );
  }

  const kicker = t("booking.kicker_table");
  const closeHandler = variant === "popup" ? onClose : undefined;

  if (step === "auth") {
    return (
      <div className={`booking-form booking-form-${variant} mshell-content`}>
        <ModalHeader
          kicker={kicker}
          step={t("booking.step", { n: 2, total: 2 })}
          title={t("booking.auth_title")}
          titleId={titleId}
          subtitle={venueName}
          onClose={closeHandler}
        />
        <ModalBody className="bk-body">
          <p className="bk-slot-pill" role="status">
            <i aria-hidden="true" />
            <span>
              <strong>{venueName}</strong> · {summary}
            </span>
          </p>
          <div ref={authRef} className="bk-auth">
            <AuthForm
              initialMode="register"
              hint={t("booking.auth_hint")}
              onSuccess={() => {
                setSignedIn(true);
                setStep("pick");
                void book();
              }}
            />
          </div>
        </ModalBody>
        <ModalFooter summary={summary}>
          <Button variant="secondary" size="md" onClick={() => setStep("pick")}>
            ← {t("common.back")}
          </Button>
        </ModalFooter>
      </div>
    );
  }

  return (
    <div className={`booking-form booking-form-${variant} mshell-content`}>
      <ModalHeader
        kicker={kicker}
        step={signedIn ? undefined : t("booking.step", { n: 1, total: 2 })}
        title={quick ? t("res.quick_title") : t("res.confirm_title")}
        titleId={titleId}
        subtitle={quick ? t("res.quick_subtitle", { venue: venueName }) : venueName}
        onClose={closeHandler}
      />

      <ModalBody className="bk-body">
        <div className="bk-grid-2">
          <div className="booking-field">
            <span className="booking-field-label">{t("res.table")}</span>
            <div className="booking-table-row">
              <p className={`booking-table-value${chosenTables.length ? "" : " auto"}`}>
                {tablesLabel(chosenTables)}
              </p>
              {!quick && onClearTable ? (
                <button type="button" className="btn btn--link booking-table-clear" onClick={onClearTable}>
                  {t("res.change_table")}
                </button>
              ) : null}
            </div>
          </div>
          <div className="booking-field">
            <label className="booking-field-label" htmlFor={`${titleId}-guests`}>
              {t("res.guests")}
            </label>
            <div className="booking-stepper bk-stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label={t("res.guests_less")}
                disabled={guests <= 1}
                onClick={() => setGuests(Math.max(1, guests - 1))}
              >
                −
              </button>
              <input
                id={`${titleId}-guests`}
                type="text"
                inputMode="numeric"
                value={guests}
                onChange={(e) =>
                  setGuests(Math.max(1, Math.min(maxGuests, Number(e.target.value.replace(/\D/g, "")) || 1)))
                }
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label={t("res.guests_more")}
                disabled={guests >= maxGuests}
                onClick={() => setGuests(Math.min(maxGuests, guests + 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {table && table.status !== "FREE" && (
          <p className="booking-busy-hint">{t("res.busy_now_hint")}</p>
        )}

        <div className="booking-field">
          <span className="booking-field-label" id={`${titleId}-duration`}>{t("res.duration")}</span>
          <ScrollerFade trackClassName="bk-chips" ariaLabelledBy={`${titleId}-duration`} activeKey={durationMin}>
            {durations.map((min) => (
              <button
                key={min}
                type="button"
                className={`chip${min === durationMin ? " is-active" : ""}`}
                aria-pressed={min === durationMin}
                onClick={() => {
                  setChosenDuration(min);
                  setSlotIso(null);
                }}
              >
                {formatDuration(min)}
              </button>
            ))}
          </ScrollerFade>
        </div>

        <DayPicker
          label={t("res.day")}
          min={days[0].day}
          max={days[days.length - 1].day}
          value={activeDay.day}
          onChange={(day) => {
            const offset = days.findIndex((d) => sameLocalDay(d.day, day));
            if (offset < 0) return;
            setDayOffset(offset);
            setSlotIso(null);
          }}
          isClosed={(day) => days.find((d) => sameLocalDay(d.day, day))?.closed ?? true}
          hasFree={(day) => days.find((d) => sameLocalDay(d.day, day))?.hasFree ?? false}
        />

        <div className="booking-field">
          <span className="booking-field-label">{t("res.time")}</span>
          {activeDay.hasFree ? (
            <div className="booking-slot-time-groups">
              {groupSlotsByDayPart(activeDay.slots).map((group) => (
                <div key={group.id} className="booking-slot-period">
                  <p className="booking-slot-period-label">{t(DAY_PART_LABEL[group.id])}</p>
                  <ScrollerFade
                    trackClassName="booking-slot-times bk-chips"
                    role="group"
                    ariaLabel={t(DAY_PART_LABEL[group.id])}
                    activeKey={selectedIso}
                  >
                    {group.slots.map((slot) => {
                      const iso = slot.start.toISOString();
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={`chip${iso === selectedIso ? " is-active" : ""}`}
                          aria-pressed={iso === selectedIso}
                          disabled={!slot.available}
                          onClick={() => setSlotIso(iso)}
                        >
                          {formatClock(slot.start)}
                        </button>
                      );
                    })}
                  </ScrollerFade>
                </div>
              ))}
            </div>
          ) : (
            <p className="web-book-muted">
              {candidates.length === 0
                ? t("res.no_table_for_guests")
                : activeDay.closed
                  ? t("res.closed_day")
                  : t("res.no_slots")}
            </p>
          )}
        </div>

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
          <div ref={errorRef} className="web-book-error booking-form-error" role="alert">
            <p>{t(errorKey)}</p>
            {errorKey === "error.active_reservation" ? (
              <Link
                className="btn btn--secondary btn--md booking-form-error-link"
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
        {footer}
        {signedIn ? null : <p className="web-book-muted tiny">{t("res.account_hint")}</p>}
      </ModalBody>

      <ModalFooter summary={summary}>
        {closeHandler ? (
          <Button variant="ghost" size="md" className="is-desktop-only" onClick={closeHandler}>
            {t("res.close")}
          </Button>
        ) : null}
        <Button
          size="lg"
          className="bk-cta"
          // Only blocked while sending: with no bookable time a press says why (book()).
          loading={busy}
          onClick={() => void book()}
        >
          {selectedDate
            ? t("res.confirm_book_at", { time: formatClock(selectedDate) })
            : t("res.confirm_book")}
        </Button>
      </ModalFooter>
    </div>
  );
}
