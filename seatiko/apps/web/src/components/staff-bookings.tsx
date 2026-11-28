"use client";

import { useState } from "react";
import { fill, StaffEmpty, type StaffCopy } from "@/components/staff-live";
import type { LocaleCode } from "@/lib/api";
import {
  bookingState,
  formatClock,
  formatDuration,
  isClosed,
  STATE_TONE,
  type BookingState,
  type CabinetBooking,
} from "@/lib/cabinet-bookings";
import { pluralize } from "@/lib/cabinet-helpers";
import type { getSiteCopy } from "@/lib/site-copy";

type BookingsCopy = ReturnType<typeof getSiteCopy>["cabinet"]["bookings"];

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

export function stateLabel(state: BookingState, b: CabinetBooking, copy: BookingsCopy): string {
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
      return "";
  }
}

/**
 * Today's bookings for the host: who comes when, to which table, and how each is going
 * (late, announced a delay, arrived). Read-only until the API lets staff mark arrivals (№22).
 */
export function StaffBookingsTab({
  copy,
  bcopy,
  locale,
  bookings,
  holdMin,
  now,
}: {
  copy: StaffCopy;
  bcopy: BookingsCopy;
  locale: LocaleCode;
  /** Bookings of the venue day, by time. */
  bookings: CabinetBooking[];
  holdMin: number;
  now: number;
}) {
  const s = copy.bookings;
  const [showEarlier, setShowEarlier] = useState(false);
  const live = bookings.filter((b) => !isClosed(b) && b.end > now);
  const earlier = bookings.filter((b) => isClosed(b) || b.end <= now);
  const active = bookings.filter((b) => !isClosed(b));
  const covers = active.reduce((n, b) => n + b.guests, 0);
  const nextId = live.find((b) => b.start > now || bookingState(b, now, holdMin) === "late")?.id;

  const tables = (b: CabinetBooking) =>
    b.tableNumbers.length > 1
      ? fill(copy.tablesN, { list: b.tableNumbers.join(", ") })
      : b.tableNumbers.length
        ? fill(copy.tableN, { n: b.tableNumbers[0] })
        : "";

  const row = (b: CabinetBooking) => {
    const state = bookingState(b, now, holdMin);
    const tone = STATE_TONE[state];
    const items = b.preorder?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
    return (
      <li key={b.id} className={`sf-bk tone-${tone} ${b.id === nextId ? "is-next" : ""}`}>
        <div className="sf-bk-time">
          <strong>{formatClock(b.start)}</strong>
          <small>{formatDuration(b.durationMin, { hours: bcopy.hoursUnit, minutes: bcopy.minutesUnit, hoursMinutes: bcopy.hoursMinutesUnit })}</small>
        </div>
        <div className="sf-bk-text">
          <strong>
            {[tables(b), `${b.guests} ${pluralize(b.guests, copy.guestsForms, locale)}`].filter(Boolean).join(" · ")}
            {b.id === nextId && <em className="sf-chip tone-live">{s.next}</em>}
          </strong>
          <span>
            {[b.guestName || s.guest, b.source ? bcopy[`source${b.source}`] : ""].filter(Boolean).join(" · ")}
          </span>
          {b.notes && <p className="sf-bk-note">{b.notes}</p>}
          {b.preorder && items > 0 && (
            <small className="sf-bk-pre">
              {bcopy.preorder} · {items} {pluralize(items, copy.orders.itemsForms, locale)}
              {b.preorder.kitchen_at ? ` · ${fill(bcopy.preorderKitchen, { time: formatClock(Date.parse(b.preorder.kitchen_at)) })}` : ""}
            </small>
          )}
        </div>
        <span className={`sf-chip state-${tone}`}>{stateLabel(state, b, bcopy)}</span>
      </li>
    );
  };

  if (bookings.length === 0) return <StaffEmpty icon={<CalendarIcon />} title={s.emptyTitle} hint={s.emptyHint} />;

  return (
    <div className="sf-stack">
      <div className="sf-summary" role="status">
        <span>
          <b>
            {fill(s.summary, {
              bookings: `${active.length} ${pluralize(active.length, bcopy.bookingsForms, locale)}`,
              guests: `${covers} ${pluralize(covers, copy.guestsForms, locale)}`,
            })}
          </b>
        </span>
        <span>{bcopy.timezoneNote}</span>
      </div>

      {live.length > 0 ? (
        <section className="owner-card sf-card">
          <ul className="sf-list">{live.map(row)}</ul>
        </section>
      ) : (
        <p className="sf-hint sf-hint-card">{s.allDone}</p>
      )}

      {earlier.length > 0 && (
        <section className="owner-card sf-card sf-card-quiet">
          <button type="button" className="btn btn--ghost btn--sm sf-toggle" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}>
            <span>{showEarlier ? s.hideEarlier : fill(s.earlier, { n: earlier.length })}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showEarlier && <ul className="sf-list sf-list-quiet">{earlier.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}
