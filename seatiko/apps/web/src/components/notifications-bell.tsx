"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  ApiError,
  fetchNotifications,
  markNotificationsRead,
  openNotificationStream,
  pickLocale,
  type AppNotification,
} from "@/lib/api";
import { mergeNotification, notificationHref, notificationTextKey } from "@/lib/notifications";

/** Fallback refresh while the live stream is down. */
const POLL_MS = 60_000;
const RETRY_MIN_MS = 3_000;
const RETRY_MAX_MS = 60_000;

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Header bell for signed-in users: unread badge, latest notifications, live updates
 * over /me/notifications/stream (reconnects with backoff; polls while it is down).
 */
export function NotificationsBell({ token, role }: { token: string; role?: string }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  // Initial list, live stream with reconnect, polling fallback. Restarts when the token changes.
  useEffect(() => {
    let alive = true;
    let live = false;
    let retryMs = RETRY_MIN_MS;
    let retryTimer: number | undefined;
    const controller = new AbortController();

    const refresh = () =>
      fetchNotifications()
        .then((data) => {
          if (!alive) return;
          setItems(data.notifications);
          setUnread(data.unread);
        })
        .catch(() => {
          /* offline: keep what we have */
        });

    const connect = () => {
      openNotificationStream((event, data) => {
        if (!alive) return;
        if (event === "ready") {
          live = true;
          retryMs = RETRY_MIN_MS;
          try {
            setUnread((JSON.parse(data) as { unread: number }).unread);
          } catch {
            /* ignore */
          }
          return;
        }
        if (event === "notification") {
          try {
            const n = JSON.parse(data) as AppNotification;
            setItems((prev) => mergeNotification(prev, n));
            setUnread((count) => count + 1);
          } catch {
            /* ignore malformed event */
          }
        }
      }, controller.signal)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) alive = false;
        })
        .finally(() => {
          live = false;
          if (!alive || controller.signal.aborted) return;
          retryTimer = window.setTimeout(() => {
            void refresh();
            connect();
          }, retryMs);
          retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        });
    };

    void refresh();
    connect();
    const poll = window.setInterval(() => {
      if (!live) void refresh();
    }, POLL_MS);

    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(poll);
      window.clearTimeout(retryTimer);
    };
  }, [token]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const clock = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, read_at: readAt } : item)));
      markNotificationsRead([n.id])
        .then(setUnread)
        .catch(() => setUnread((count) => Math.max(0, count - 1)));
    }
    router.push(notificationHref(n, role));
  }

  function markAll() {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: readAt })));
    setUnread(0);
    markNotificationsRead().catch(() => {
      /* next refresh shows the real count */
    });
  }

  return (
    <div className={`site-notify${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="btn btn--secondary btn--sm btn--icon site-notify-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("notify.open", { count: unread })}
        title={t("notify.title")}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="site-notify-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="site-notify-panel" role="dialog" aria-label={t("notify.title")}>
          <div className="site-notify-head">
            <strong>{t("notify.title")}</strong>
            {unread > 0 ? (
              <button type="button" className="btn btn--link" onClick={markAll}>
                {t("notify.mark_all")}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="site-notify-empty">{t("notify.empty")}</p>
          ) : (
            <ul aria-live="polite">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read_at ? "" : "unread"}
                    onClick={() => openItem(n)}
                  >
                    <span className="site-notify-text">
                      {t(notificationTextKey(n), {
                        venue: n.venue_name ? pickLocale(n.venue_name, locale) : "",
                        time: clock(n.at),
                      })}
                    </span>
                    <time dateTime={n.created_at}>{when(n.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
