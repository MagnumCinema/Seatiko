"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cancelReservation, pickLocale, type Table, type Venue } from "@/lib/api";
import {
  buildIcs,
  googleCalendarUrl,
  icsFileName,
  mapsRouteUrl,
  shareText,
  type BookingShareInput,
} from "@/lib/booking-share";
import type { BookingRules } from "@/lib/venue-rules";
import { useLocale } from "@/components/locale-provider";

export type BookedReservation = {
  id: string;
  tables: Table[];
  at: Date;
  duration: number;
  guests: number;
  notes: string;
};

type BookingConfirmationProps = {
  booked: BookedReservation;
  venue: Venue;
  venueName: string;
  rules: BookingRules;
  variant: "popup" | "inline";
  titleId: string;
  formatDuration: (min: number) => string;
  onClose?: () => void;
  /** Reset the form to book a different time. */
  onBookAgain: () => void;
  /** Called after a successful cancellation (refresh plan / schedule). */
  onCancelled?: () => void;
  /** Inline: extra links next to the main actions. */
  extraActions?: ReactNode;
};

/** Success screen after booking: actions on the left, the reservation as a "table" ticket on the right. */
export function BookingConfirmation({
  booked,
  venue,
  venueName,
  rules,
  variant,
  titleId,
  formatDuration,
  onClose,
  onBookAgain,
  onCancelled,
  extraActions,
}: BookingConfirmationProps) {
  const { locale, t } = useLocale();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState(false);
  const [shared, setShared] = useState(false);

  const clock = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const shift = (min: number) => new Date(booked.at.getTime() + min * 60_000);
  const start = clock(booked.at);
  const end = clock(shift(booked.duration));
  const dateLabel = booked.at.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const tableNumbers = booked.tables.map((tb) => tb.number).join(" + ");
  const seats = booked.tables.reduce((sum, tb) => sum + tb.seats, 0);
  const code = booked.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  const chairs = Math.min(4, Math.max(1, Math.ceil(seats / 2)));

  const shareInput: BookingShareInput = {
    reservationId: booked.id,
    venueName,
    address: pickLocale(venue.address, locale) || undefined,
    lat: venue.lat,
    lng: venue.lng,
    start: booked.at,
    durationMin: booked.duration,
    tables: booked.tables.map((tb) => tb.number),
    guests: booked.guests,
    notes: booked.notes || undefined,
    url: typeof window === "undefined" ? undefined : `${window.location.origin}/venues/${venue.id}`,
    tableLabel: t(booked.tables.length > 1 ? "res.ticket_tables" : "res.ticket_table").toLowerCase(),
    guestsLabel: t("res.guests"),
  };
  const allowPreorder = venue.allow_preorder !== false;

  function downloadIcs() {
    const blob = new Blob([buildIcs(shareInput)], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = icsFileName(shareInput);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function share() {
    const text = shareText(
      shareInput,
      { table: t("res.ticket_table"), guests: t("res.guests") },
      (d) => `${d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}, ${clock(d)}–${end}`,
    );
    try {
      if (navigator.share) {
        await navigator.share({ title: venueName, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {
      /* the guest closed the share sheet */
    }
  }

  async function cancel() {
    setCancelling(true);
    setCancelError(false);
    try {
      await cancelReservation(booked.id);
      setCancelled(true);
      setConfirmCancel(false);
      onCancelled?.();
    } catch {
      setCancelError(true);
    } finally {
      setCancelling(false);
    }
  }

  const chairRow = (
    <span className="booking-ticket-chairs" aria-hidden="true">
      {Array.from({ length: chairs }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );

  return (
    <div className={`booking-done booking-done-${variant}${cancelled ? " is-cancelled" : ""}`}>
      <div className="booking-done-main">
        <span className={`booking-done-badge${cancelled ? " cancelled" : ""}`} aria-hidden="true">
          {cancelled ? "×" : "✓"}
        </span>
        <h2 id={titleId}>{cancelled ? t("res.done_cancelled_title") : t("res.success")}</h2>
        <p className="booking-done-lead" role="status">
          {cancelled
            ? t("res.done_cancelled_lead")
            : t("res.done_lead", { venue: venueName, date: dateLabel, time: start })}
        </p>

        {!cancelled ? (
          <ul className="booking-done-facts">
            <li>
              {rules.hold_minutes > 0
                ? t("res.done_late_free", { time: clock(shift(rules.hold_minutes)) })
                : t("res.rule_late_none")}
            </li>
            {rules.max_late_arrival_min > rules.hold_minutes ? (
              <li>{t("res.done_late_coming", { time: clock(shift(rules.max_late_arrival_min)) })}</li>
            ) : null}
            {rules.session_start_before_min > 0 ? (
              <li>
                {/* Walk-ins may still sit there until release_before_min: earlier seating needs a free table. */}
                {rules.session_start_before_min > rules.release_before_min
                  ? t("table.rule_you_from_if_free", { time: clock(shift(-rules.session_start_before_min)) })
                  : t("res.done_seat_early", { time: clock(shift(-rules.session_start_before_min)) })}
              </li>
            ) : null}
          </ul>
        ) : null}

        {cancelError ? (
          <p className="web-book-error" role="alert">
            {t("res.done_cancel_error")}
          </p>
        ) : null}

        <div className="booking-done-buttons">
          {cancelled ? (
            <button type="button" className="venue-cta venue-cta-hero" onClick={onBookAgain}>
              {t("res.done_rebook")}
            </button>
          ) : confirmCancel ? (
            <div className="booking-done-confirm" role="group" aria-label={t("res.done_cancel")}>
              <p>{t("res.done_cancel_confirm", { time: start })}</p>
              <div>
                <button
                  type="button"
                  className="venue-cta booking-done-danger"
                  disabled={cancelling}
                  onClick={() => void cancel()}
                >
                  {cancelling ? t("res.done_cancelling") : t("res.done_cancel_yes")}
                </button>
                <button
                  type="button"
                  className="venue-cta venue-cta-outline"
                  disabled={cancelling}
                  onClick={() => setConfirmCancel(false)}
                >
                  {t("res.done_cancel_no")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Link
                href={`/account?reservation=${encodeURIComponent(booked.id)}`}
                className="venue-cta venue-cta-hero"
              >
                {t("res.done_open")}
              </Link>
              <button
                type="button"
                className="venue-cta booking-done-cancel"
                onClick={() => setConfirmCancel(true)}
              >
                {t("res.done_cancel")}
              </button>
            </>
          )}
          {extraActions}
          {variant === "popup" && onClose ? (
            <button type="button" className="venue-cta venue-cta-outline" onClick={onClose}>
              {t("res.close")}
            </button>
          ) : !cancelled ? (
            <button type="button" className="venue-cta venue-cta-outline" onClick={onBookAgain}>
              {t("book.done_more")}
            </button>
          ) : null}
        </div>
        {!cancelled ? (
          <div className="booking-done-extras" aria-label={t("res.extras_label")}>
            <button type="button" onClick={downloadIcs}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
              </svg>
              {t("res.extra_calendar")}
            </button>
            <a href={googleCalendarUrl(shareInput)} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4M8 14h3M8 17h6" />
              </svg>
              {t("res.extra_google")}
            </a>
            <a href={mapsRouteUrl(shareInput)} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              {t("res.extra_route")}
            </a>
            <button type="button" onClick={() => void share()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
              </svg>
              <span aria-live="polite">{shared ? t("res.extra_copied") : t("res.extra_share")}</span>
            </button>
            {allowPreorder ? (
              <Link
                className="wide"
                href={`/venues/${venue.id}/menu?preorder=${encodeURIComponent(booked.id)}&table=${encodeURIComponent(tableNumbers)}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v8a3 3 0 0 1-3 3M17 21V3c-2 1.5-3 4-3 7v4h3" />
                </svg>
                {t("res.extra_preorder")}
              </Link>
            ) : null}
          </div>
        ) : null}
        <p className="web-book-muted tiny">{t("res.success_hint")}</p>
      </div>

      <article className="booking-ticket" aria-label={t("res.ticket_label")}>
        {chairRow}
        <div className="booking-ticket-body">
          <header className="booking-ticket-head">
            <span className="booking-ticket-status">
              {cancelled ? t("res.ticket_cancelled") : t("res.ticket_confirmed")}
            </span>
            <span className="booking-ticket-kicker">
              {booked.tables.length > 1 ? t("res.ticket_tables") : t("res.ticket_table")}
            </span>
            <strong className="booking-ticket-number">№{tableNumbers}</strong>
            <span className="booking-ticket-seats">{t("res.ticket_seats", { n: seats })}</span>
          </header>
          <div className="booking-ticket-cut" aria-hidden="true" />
          <dl className="booking-ticket-facts">
            <div className="wide">
              <dt>{t("res.ticket_venue")}</dt>
              <dd>{venueName}</dd>
            </div>
            <div className="wide">
              <dt>{t("res.day")}</dt>
              <dd className="first-cap">{dateLabel}</dd>
            </div>
            <div>
              <dt>{t("res.time")}</dt>
              <dd>
                {start}–{end}
              </dd>
            </div>
            <div>
              <dt>{t("res.duration")}</dt>
              <dd>{formatDuration(booked.duration)}</dd>
            </div>
            <div>
              <dt>{t("res.guests")}</dt>
              <dd>{booked.guests}</dd>
            </div>
            <div>
              <dt>{t("res.ticket_code")}</dt>
              <dd className="mono">#{code}</dd>
            </div>
            {booked.notes ? (
              <div className="wide">
                <dt>{t("res.notes")}</dt>
                <dd>{booked.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {chairRow}
      </article>
    </div>
  );
}
