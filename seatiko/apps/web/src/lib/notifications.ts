import type { AppNotification } from "@/lib/api";
import type { MessageKey } from "@/components/locale-provider";

/** Message key per notification kind (messages/*.json, `notify.*`). */
export const NOTIFICATION_TEXT: Record<string, MessageKey> = {
  PREORDER_CREATED: "notify.preorder_created",
  PREORDER_UPDATED: "notify.preorder_updated",
  PREORDER_CANCELLED: "notify.preorder_cancelled",
  PREORDER_PREPARING: "notify.preorder_preparing",
  PREORDER_ADULT_REMOVED: "notify.preorder_adult_removed",
  PREORDER_AGE_REFUSED: "notify.preorder_age_refused",
  ADULT_GRANTED: "notify.adult_granted",
  ADULT_REVOKED: "notify.adult_revoked",
};

const STAFF_KINDS = new Set(["PREORDER_CREATED", "PREORDER_UPDATED", "PREORDER_CANCELLED"]);

export function notificationTextKey(n: Pick<AppNotification, "kind">): MessageKey {
  return NOTIFICATION_TEXT[n.kind] ?? "notify.generic";
}

/** Where a click on the notification leads: staff panel / owner cabinet for venue events, else the guest account. */
export function notificationHref(n: Pick<AppNotification, "kind">, role?: string | null): string {
  if (role === "staff") return "/staff";
  if (role === "restaurant" && (STAFF_KINDS.has(n.kind) || n.kind === "PREORDER_PREPARING")) return "/cabinet";
  if (role === "admin") return "/admin";
  return "/account";
}

/** Adds a live notification on top, without duplicates, keeping at most `max`. */
export function mergeNotification(list: AppNotification[], n: AppNotification, max = 30): AppNotification[] {
  return [n, ...list.filter((item) => item.id !== n.id)].slice(0, max);
}
