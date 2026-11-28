"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { lockBodyScroll } from "@/lib/modal-stack";
import { useLocale } from "@/components/locale-provider";
import { IconButton } from "@/components/ui/button";

export type ModalSize = "sm" | "md" | "lg";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  /** sm 460px (confirm, sign-in), md 680px (booking, banquet), lg 880px (documents). */
  size?: ModalSize;
  /** id of the visible title (aria-labelledby). */
  labelledBy?: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  id?: string;
  className?: string;
  /** A click on the dimmed page closes the dialog (off for forms with unsaved input). */
  closeOnBackdrop?: boolean;
  /** Always-dark surface (keeps gold buttons in the light theme). */
  surface?: "dark";
  children: ReactNode;
};

/**
 * The one dialog primitive: a centred card on desktop, a bottom sheet flush with the
 * screen edge on phones (≤ 720px). Header and footer stay put while the body scrolls;
 * the page behind is locked, focus is trapped and Esc closes the top dialog.
 */
export function ModalShell({
  open,
  onClose,
  size = "md",
  labelledBy,
  describedBy,
  role = "dialog",
  id,
  className = "",
  closeOnBackdrop = true,
  surface,
  children,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`mshell-root mshell-root--${size}`} role="presentation">
      <div
        className="mshell-backdrop"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <section
        ref={dialogRef}
        id={id}
        className={`mshell mshell--${size} ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-surface={surface}
      >
        <span className="mshell-grab" aria-hidden="true" />
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** The × in the top-right corner of every dialog. */
export function ModalClose({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  const { t } = useLocale();
  return (
    <IconButton
      variant="secondary"
      size="sm"
      className={`mshell-x ${className}`.trim()}
      label={t("common.close")}
      icon={<CloseIcon />}
      onClick={onClose}
    />
  );
}

/** Sticky dialog header: kicker (+ step pill), title, one-line subtitle and the ×. */
export function ModalHeader({
  title,
  titleId,
  kicker,
  step,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  kicker?: ReactNode;
  /** "Шаг 1 из 2" pill next to the kicker. */
  step?: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  /** Extra row under the title that must not scroll away (tabs, a slot summary). */
  children?: ReactNode;
}) {
  return (
    <header className="mshell-head">
      <div className="mshell-head-row">
        <div className="mshell-head-text">
          {kicker || step ? (
            <div className="mshell-kicker-row">
              {kicker ? <span className="mshell-kicker">{kicker}</span> : null}
              {step ? <span className="mshell-step">{step}</span> : null}
            </div>
          ) : null}
          <h2 id={titleId} className="mshell-title">
            {title}
          </h2>
          {subtitle ? <p className="mshell-sub">{subtitle}</p> : null}
        </div>
        {onClose ? <ModalClose onClose={onClose} /> : null}
      </div>
      {children}
    </header>
  );
}

export function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mshell-body ${className}`.trim()}>{children}</div>;
}

/** Pinned footer: a short summary on the left, the actions (main CTA last) on the right. */
export function ModalFooter({
  summary,
  children,
  className = "",
}: {
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer className={`mshell-foot${summary ? " has-summary" : ""} ${className}`.trim()}>
      {summary ? <p className="mshell-foot-summary">{summary}</p> : null}
      <div className="mshell-foot-actions">{children}</div>
    </footer>
  );
}
