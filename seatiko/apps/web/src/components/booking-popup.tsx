"use client";

import { useEffect } from "react";
import type { Table, Venue } from "@/lib/api";
import { BookingForm } from "@/components/booking-form";
import { ModalShell } from "@/components/ui/modal-shell";
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

/** The booking form in the shared ModalShell (bottom sheet on phones); it remounts (resets) on every open. */
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

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      size="md"
      id={BOOKING_ANCHOR_ID}
      labelledBy="booking-popup-title"
      className="booking-modal"
    >
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
    </ModalShell>
  );
}
