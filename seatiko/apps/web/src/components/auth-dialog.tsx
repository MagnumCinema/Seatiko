"use client";

import { AuthForm } from "@/components/auth-form";
import { ModalBody, ModalClose, ModalShell } from "@/components/ui/modal-shell";

type AuthDialogProps = {
  open: boolean;
  /** Why sign-in is needed, e.g. "Войдите, чтобы получить уведомление". */
  reason?: string;
  onClose: () => void;
  onSuccess: () => void;
};

/** Inline sign-in / sign-up in the shared ModalShell so guests keep their place on the page. */
export function AuthDialog({ open, reason, onClose, onSuccess }: AuthDialogProps) {
  return (
    <ModalShell open={open} onClose={onClose} size="sm" labelledBy="auth-dialog-title" className="auth-modal">
      <ModalClose onClose={onClose} className="mshell-float-x" />
      <ModalBody className="auth-modal-body">
        <AuthForm titleId="auth-dialog-title" hint={reason} onSuccess={onSuccess} />
      </ModalBody>
    </ModalShell>
  );
}
