"use client";

import { createPortal } from "react-dom";
import { useRef } from "react";
import { AuthForm } from "@/components/auth-form";
import { useLocale } from "@/components/locale-provider";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type AuthDialogProps = {
  open: boolean;
  /** Why sign-in is needed, e.g. "Войдите, чтобы получить уведомление". */
  reason?: string;
  onClose: () => void;
  onSuccess: () => void;
};

/** Inline sign-in / sign-up so guests keep their place on the page. */
export function AuthDialog({ open, reason, onClose, onSuccess }: AuthDialogProps) {
  const { t } = useLocale();
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(open, ref, onClose);

  if (!open) return null;

  return createPortal(
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={onClose}
      />
      <section
        ref={ref}
        className="booking-popup auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <div className="booking-popup-card">
          <button
            type="button"
            className="booking-popup-x auth-dialog-x"
            onClick={onClose}
            aria-label={t("res.close")}
          >
            ×
          </button>
          <AuthForm titleId="auth-dialog-title" hint={reason} onSuccess={onSuccess} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
