"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  confirmArrival,
  getToken,
  type Table,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";

export const COMING_ANCHOR_ID = "venue-coming";

const RELEASE_BEFORE_MIN = 15;
const SESSION_START_BEFORE_MIN = 60;

type ComingPopupProps = {
  table: Table;
  open: boolean;
  onClose: () => void;
  onConfirmed?: (arrivalIso: string) => void;
  loginNext?: string;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function ComingPopup({
  table,
  open,
  onClose,
  onConfirmed,
  loginNext,
}: ComingPopupProps) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const reservedFor = useMemo(
    () => (table.reserved_for ? new Date(table.reserved_for) : null),
    [table.reserved_for],
  );
  const releaseBy = useMemo(
    () => (reservedFor ? addMinutes(reservedFor, -RELEASE_BEFORE_MIN) : null),
    [reservedFor],
  );
  const sessionFrom = useMemo(
    () =>
      reservedFor ? addMinutes(reservedFor, -SESSION_START_BEFORE_MIN) : null,
    [reservedFor],
  );

  const [arrival, setArrival] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open || !reservedFor) return;
    queueMicrotask(() => {
      const now = new Date();
      const defaultArrival =
        now.getTime() <= reservedFor.getTime() ? now : reservedFor;
      setArrival(toLocalInputValue(defaultArrival));
      setError(null);
      setDone(false);
      setBusy(false);
    });
  }, [open, table.id, reservedFor]);

  useEffect(() => {
    if (!open) return;

    const url = new URL(window.location.href);
    if (url.hash !== `#${COMING_ANCHOR_ID}`) {
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}#${COMING_ANCHOR_ID}`,
      );
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, table.id, onClose]);

  if (!open || !reservedFor || !releaseBy || !sessionFrom) return null;

  const bookingAt = reservedFor;
  const freeBy = releaseBy;
  const sessionAt = sessionFrom;
  const maxArrival = toLocalInputValue(bookingAt);
  const formatClock = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  function applyChip(minutesFromNow: number | "booking") {
    const next =
      minutesFromNow === "booking"
        ? bookingAt
        : addMinutes(new Date(), minutesFromNow);
    const clamped =
      next.getTime() > bookingAt.getTime() ? bookingAt : next;
    setArrival(toLocalInputValue(clamped));
  }

  function handleClose() {
    const url = new URL(window.location.href);
    if (url.hash === `#${COMING_ANCHOR_ID}`) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
    onClose();
  }

  async function submit() {
    setError(null);
    if (!getToken()) {
      setError(t("table.login_needed"));
      if (loginNext) {
        router.push(`/login?next=${encodeURIComponent(loginNext)}`);
      }
      return;
    }
    if (!table.reservation_id) {
      setError(t("common.error"));
      return;
    }
    const chosen = new Date(arrival);
    if (Number.isNaN(chosen.getTime())) {
      setError(t("common.error"));
      return;
    }
    if (chosen.getTime() > bookingAt.getTime()) {
      setError(t("table.im_coming_arrival_max", { time: formatClock(bookingAt) }));
      return;
    }

    setBusy(true);
    try {
      await confirmArrival(table.reservation_id, {
        expected_arrival: chosen.toISOString(),
      });
      setDone(true);
      onConfirmed?.(chosen.toISOString());
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? t("table.login_needed")
          : e instanceof ApiError
            ? e.code
            : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  }

  const arrivalLabel = arrival
    ? new Date(arrival).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={handleClose}
      />
      <section
        id={COMING_ANCHOR_ID}
        className="booking-popup coming-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-popup-title"
      >
        <div className="booking-popup-card">
          {done ? (
            <div className="booking-popup-done">
              <p className="venue-page-kicker">{t("table.im_coming")}</p>
              <h2 id="coming-popup-title">{t("table.im_coming_confirm_title")}</h2>
              <p>{t("table.im_coming_set", { time: arrivalLabel })}</p>
              <p className="web-book-muted">
                {t("table.rule_release", { time: formatClock(freeBy) })}
              </p>
              <button
                type="button"
                className="venue-cta venue-cta-primary"
                onClick={handleClose}
              >
                {t("res.close")}
              </button>
            </div>
          ) : (
            <>
              <header className="booking-popup-head">
                <div>
                  <p className="venue-page-kicker">
                    {t("table.title", { n: table.number })}
                  </p>
                  <h2 id="coming-popup-title">
                    {t("table.im_coming_confirm_title")}
                  </h2>
                  <p className="web-book-muted">
                    {t("table.reserved_for", {
                      time: formatClock(bookingAt),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  className="booking-popup-x"
                  onClick={handleClose}
                  aria-label={t("res.close")}
                >
                  ×
                </button>
              </header>

              <div className="booking-popup-body">
                <label>
                  {t("table.im_coming_when")}
                  <input
                    type="datetime-local"
                    value={arrival}
                    max={maxArrival}
                    onChange={(e) => setArrival(e.target.value)}
                  />
                </label>

                <div className="coming-popup-chips" role="group">
                  <button type="button" onClick={() => applyChip(0)}>
                    {t("table.im_coming_chip_now")}
                  </button>
                  <button type="button" onClick={() => applyChip(15)}>
                    {t("table.im_coming_chip_15")}
                  </button>
                  <button type="button" onClick={() => applyChip(30)}>
                    {t("table.im_coming_chip_30")}
                  </button>
                  <button type="button" onClick={() => applyChip("booking")}>
                    {t("table.im_coming_chip_booking")}
                  </button>
                </div>

                <div className="coming-popup-rules">
                  <p className="coming-popup-rules-title">
                    {t("table.im_coming_confirm_rules")}
                  </p>
                  <ul>
                    <li>
                      {t("table.rule_session_start", {
                        time: formatClock(sessionAt),
                      })}
                    </li>
                    <li className="coming-popup-rule-emphasis">
                      {t("table.rule_release", {
                        time: formatClock(freeBy),
                      })}
                    </li>
                  </ul>
                </div>

                {error ? <p className="web-book-error">{error}</p> : null}

                <button
                  type="button"
                  className="venue-cta venue-cta-primary"
                  disabled={busy || !arrival}
                  onClick={() => void submit()}
                >
                  {busy
                    ? t("res.booking")
                    : t("table.im_coming_confirm_ok")}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
