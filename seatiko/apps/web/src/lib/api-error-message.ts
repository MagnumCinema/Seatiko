import type { MessageKey } from "@/components/locale-provider";
import { ApiError } from "@/lib/api";

const CODE_KEYS: Record<string, MessageKey> = {
  email_taken: "error.email_taken",
  invalid_credentials: "error.invalid_credentials",
  user_not_found: "error.invalid_credentials",
  invalid_body: "error.invalid_input",
  active_reservation_exists: "error.active_reservation",
  table_not_free: "error.table_not_free",
  invalid_guests: "error.invalid_guests",
  invalid_duration: "error.invalid_duration",
  forbidden: "error.forbidden",
  invalid_status: "error.invalid_status",
  reservation_not_found: "error.not_found",
  not_found: "error.not_found",
  link_required: "error.google_link_required",
  google_email_unverified: "error.google_email_unverified",
  invalid_google_token: "error.google_unavailable",
  google_unavailable: "error.google_unavailable",
  google_signin_disabled: "error.google_unavailable",
  google_linked_elsewhere: "error.google_linked_elsewhere",
  google_already_connected: "error.google_already_connected",
  wrong_password: "error.wrong_password",
  password_required: "error.password_required",
  password_required_first: "error.password_required_first",
};

/** Message key for a failure of Google's window (lib/google-oauth), not of the API. */
export function googleErrorKey(code: string): MessageKey {
  if (code === "popup_blocked") return "error.google_popup_blocked";
  if (code === "access_denied") return "error.google_access_denied";
  return "error.google_unavailable";
}

/** Message key for an API failure; never shows raw server codes to guests. */
export function apiErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const known = CODE_KEYS[error.code];
    if (known) return known;
    return error.status === 401 ? "table.login_needed" : "common.error";
  }
  if (error instanceof TypeError) return "error.network";
  return "common.error";
}
