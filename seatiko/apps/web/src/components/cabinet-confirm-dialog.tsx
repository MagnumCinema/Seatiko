"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Props = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  /** "danger" for destructive actions (red), "warning" for disruptive but reversible ones. */
  tone?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
};

/** Centered confirmation popup in the cabinet style (same look as the dish / venue delete dialogs). */
export function CabinetConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  busy = false,
  tone = "danger",
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(open, ref, onCancel);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" aria-label={cancelLabel} onClick={onCancel} />
      <section
        ref={ref}
        className="booking-popup cabinet-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cabinet-confirm-title"
        aria-describedby="cabinet-confirm-text"
      >
        <div className={`booking-popup-card cabinet-delete-card ${tone}`}>
          <button type="button" className="booking-popup-x" onClick={onCancel} aria-label={cancelLabel}>
            ×
          </button>
          <div className="cabinet-delete-icon" aria-hidden="true">
            {tone === "danger" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            )}
          </div>
          <h3 id="cabinet-confirm-title">{title}</h3>
          <p id="cabinet-confirm-text" className="cabinet-delete-text">
            {text}
          </p>
          <div className="cabinet-delete-actions">
            <button
              type="button"
              className={tone === "danger" ? "panel-btn danger" : "panel-btn"}
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
            <button type="button" className="panel-btn ghost" data-autofocus disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
