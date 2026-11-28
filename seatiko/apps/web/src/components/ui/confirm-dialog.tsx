"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from "@/components/ui/modal-shell";

type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  /** What happens if the guest confirms. */
  body?: ReactNode;
  kicker?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** danger: destructive action (cancel a booking, delete); primary: an ordinary confirmation. */
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Shared yes / no question (role="alertdialog"): the safe choice is focused first. */
export function ConfirmDialog({
  open,
  title,
  body,
  kicker,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <ModalShell
      open={open}
      onClose={busy ? () => {} : onCancel}
      size="sm"
      role="alertdialog"
      labelledBy={titleId}
      describedBy={body ? bodyId : undefined}
      className="confirm-dialog"
    >
      <ModalHeader title={title} titleId={titleId} kicker={kicker} onClose={busy ? undefined : onCancel} />
      {body ? (
        <ModalBody>
          <div id={bodyId} className="confirm-dialog-body">
            {body}
          </div>
        </ModalBody>
      ) : null}
      <ModalFooter>
        <Button variant="secondary" size="md" data-autofocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} size="md" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}
