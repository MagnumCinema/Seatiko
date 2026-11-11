"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import type { Table, Venue } from "@/lib/api";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { BookingForm } from "@/components/booking-form";
import { useLocale } from "@/components/locale-provider";
import { stripBookingParams } from "@/lib/booking-link";

export const BOOKING_ANCHOR_ID = "venue-booking";

type BookingPopupProps = {
  venue: Venue;
  /** A specific table, or null for quick booking (any free table that fits). */
  table: Table | null;
  /** All venue tables; required for quick booking. */
  tables?: Table[];
  open: boolean;
  onClose: () => void;
  onBooked?: () => void;
  initialGuests?: number | null;
  initialTime?: string | null;
  initialDurationMin?: number | null;
};

/** Centered dialog around the shared booking form; the form remounts (resets) on every open. */
export function BookingPopup({
  venue,
  table,
  tables = [],
  open,
  onClose,
  onBooked,
  initialGuests,
  initialTime,
  initialDurationMin,
}: BookingPopupProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const url = new URL(window.location.href);
    if (url.hash !== `#${BOOKING_ANCHOR_ID}`) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}#${BOOKING_ANCHOR_ID}`);
    }
  }, [open]);

  function handleClose() {
    const url = new URL(window.location.href);
    if (url.hash === `#${BOOKING_ANCHOR_ID}`) url.hash = "";
    window.history.replaceState(null, "", stripBookingParams(url.href));
    onClose();
  }

  useDialogFocus(open, dialogRef, handleClose);

  if (!open) return null;

  return createPortal(
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={handleClose}
      />
      <section
        ref={dialogRef}
        id={BOOKING_ANCHOR_ID}
        className="booking-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-popup-title"
      >
        <div className="booking-popup-card">
          <BookingForm
            key={table?.id ?? "quick"}
            venue={venue}
            table={table}
            tables={tables}
            variant="popup"
            titleId="booking-popup-title"
            onClose={handleClose}
            onBooked={onBooked}
            initialGuests={initialGuests}
            initialTime={initialTime}
            initialDurationMin={initialDurationMin}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
