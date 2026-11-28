"use client";

import type { Venue } from "@/lib/api";
import { stripBookingParams } from "@/lib/booking-link";
import { EventInquiryForm } from "@/components/event-inquiry-form";
import { ModalShell } from "@/components/ui/modal-shell";

type EventPopupProps = {
  venue: Venue;
  open: boolean;
  onClose: () => void;
};

/** Celebration / banquet request in the shared ModalShell; a backdrop click does not drop typed input. */
export function EventPopup({ venue, open, onClose }: EventPopupProps) {
  function handleClose() {
    window.history.replaceState(null, "", stripBookingParams(window.location.href));
    onClose();
  }

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      size="md"
      labelledBy="event-popup-title"
      className="event-modal"
      closeOnBackdrop={false}
    >
      <EventInquiryForm venue={venue} titleId="event-popup-title" onClose={handleClose} />
    </ModalShell>
  );
}
