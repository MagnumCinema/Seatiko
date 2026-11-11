"use client";

import { createPortal } from "react-dom";
import { useRef } from "react";
import type { Venue } from "@/lib/api";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { stripBookingParams } from "@/lib/booking-link";
import { EventInquiryForm } from "@/components/event-inquiry-form";
import { useLocale } from "@/components/locale-provider";

type EventPopupProps = {
  venue: Venue;
  open: boolean;
  onClose: () => void;
  onAuthRequired: () => void;
};

/** Celebration / banquet inquiry in the same centred dialog as table booking. */
export function EventPopup({ venue, open, onClose, onAuthRequired }: EventPopupProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);

  function handleClose() {
    window.history.replaceState(null, "", stripBookingParams(window.location.href));
    onClose();
  }

  useDialogFocus(open, dialogRef, handleClose);

  if (!open) return null;

  return createPortal(
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={handleClose}
      />
      <section
        ref={dialogRef}
        className="booking-popup event-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-popup-title"
      >
        <div className="booking-popup-card">
          <button
            type="button"
            className="booking-popup-x event-popup-x"
            onClick={handleClose}
            aria-label={t("res.close")}
          >
            ×
          </button>
          <EventInquiryForm
            venue={venue}
            titleId="event-popup-title"
            onAuthRequired={onAuthRequired}
            onBackToTables={handleClose}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
