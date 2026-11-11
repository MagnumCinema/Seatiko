"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  confirmArrival,
  getToken,
  type Table,
} from "@/lib/api";
import { apiErrorKey } from "@/lib/api-error-message";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { seatingRules } from "@/lib/seating-rules";
import { DEFAULT_BOOKING_RULES } from "@/lib/venue-rules";
import { useLocale, type MessageKey } from "@/components/locale-provider";

export const COMING_ANCHOR_ID = "venue-coming";

/** APP_LOGIC §5.3 defaults; venues override them via session_start_before_min / release_before_min. */
export const DEFAULT_RELEASE_BEFORE_MIN = 15;
export const DEFAULT_SESSION_START_BEFORE_MIN = 60;

type ComingPopupProps = {
  table: Table;
  open: boolean;
  onClose: () => void;
  onConfirmed?: (arrivalIso: string) => void;
  onAuthRequired?: () => void;
  /** Venue limit for announced lateness (owner setting). */
  maxLateArrivalMin?: number;
  sessionStartBeforeMin?: number;
  releaseBeforeMin?: number;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


type ComingChip = "now" | "on_time" | "late15" | "late20";

/** Minutes after the booking time; "now" is relative to the moment the popup opened. */
const LATE_MINUTES: Record<Exclude<ComingChip, "now">, number> = {
  on_time: 0,
  late15: 15,
  late20: 20,
};

const COMING_CHIPS: { id: ComingChip; label: MessageKey }[] = [
  { id: "now", label: "table.im_coming_chip_now" },
  { id: "on_time", label: "table.im_coming_chip_on_time" },
  { id: "late15", label: "table.im_coming_chip_late_15" },
  { id: "late20", label: "table.im_coming_chip_late_20" },
];

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function ComingPopup({
  table,
  open,
  onClose,
  onConfirmed,
  onAuthRequired,
  maxLateArrivalMin = DEFAULT_BOOKING_RULES.max_late_arrival_min,
  sessionStartBeforeMin = DEFAULT_SESSION_START_BEFORE_MIN,
  releaseBeforeMin = DEFAULT_RELEASE_BEFORE_MIN,
}: ComingPopupProps) {
  const { locale, t } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const reservedFor = useMemo(
    () => (table.reserved_for ? new Date(table.reserved_for) : null),
    [table.reserved_for],
  );
  const rules = useMemo(
    () =>
      reservedFor ? seatingRules(reservedFor, sessionStartBeforeMin, releaseBeforeMin) : null,
    [reservedFor, sessionStartBeforeMin, releaseBeforeMin],
  );

  const [arrival, setArrival] = useState("");
  const [chip, setChip] = useState<ComingChip>("now");
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open || !reservedFor) return;
    queueMicrotask(() => {
      const now = new Date();
      setOpenedAt(now);
      const early = now.getTime() <= reservedFor.getTime();
      setArrival(toLocalInputValue(early ? reservedFor : now));
      setChip(early ? "on_time" : "now");
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
  }, [open]);

  function handleClose() {
    const url = new URL(window.location.href);
    if (url.hash === `#${COMING_ANCHOR_ID}`) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
    onClose();
  }

  useDialogFocus(open && !!reservedFor, dialogRef, handleClose);

  if (!open || !reservedFor || !rules) return null;

  const bookingAt = reservedFor;
  /** When the table is guaranteed to be ready for the booked guest. */
  const readyAt = rules.ownerFromNeedsFreeTable ? rules.walkInUntil : rules.ownerFrom;
  const formatClock = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const latestArrival = addMinutes(bookingAt, maxLateArrivalMin);

  function chipTime(id: ComingChip): Date {
    return id === "now" ? openedAt : addMinutes(bookingAt, LATE_MINUTES[id]);
  }

  /** Options already in the past (or "now" beyond the allowed lateness) are disabled. */
  function chipUnavailable(id: ComingChip): boolean {
    if (id === "now") return openedAt.getTime() > latestArrival.getTime();
    const at = chipTime(id).getTime();
    return at < openedAt.getTime() || at > latestArrival.getTime();
  }

  function applyChip(next: ComingChip) {
    setChip(next);
    setArrival(toLocalInputValue(chipTime(next)));
  }

  async function submit() {
    setError(null);
    if (!getToken()) {
      if (onAuthRequired) onAuthRequired();
      else setError(t("table.login_needed"));
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
    if (chosen.getTime() > latestArrival.getTime()) {
      setError(t("table.im_coming_arrival_max", { time: formatClock(latestArrival) }));
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
      if (e instanceof ApiError && e.status === 401 && onAuthRequired) {
        onAuthRequired();
      } else {
        setError(t(apiErrorKey(e)));
      }
    } finally {
      setBusy(false);
    }
  }

  const lateMinutes = arrival
    ? Math.max(0, Math.round((new Date(arrival).getTime() - bookingAt.getTime()) / 60_000))
    : 0;
  const arrivalLabel = arrival
    ? new Date(arrival).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return createPortal(
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={handleClose}
      />
      <section
        ref={dialogRef}
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
                {t("table.rule_ready_for_you", { time: formatClock(readyAt) })}
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
                <div className="booking-field">
                  <span className="booking-field-label">{t("table.im_coming_when")}</span>
                  <p className="booking-table-value" aria-live="polite">
                    {arrivalLabel}
                    {lateMinutes > 0 ? (
                      <span className="coming-late-note">
                        {t("table.im_coming_late_note", { min: lateMinutes })}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="booking-field">
                  <span className="booking-field-label" id="coming-quick-label">
                    {t("table.im_coming_quick")}
                  </span>
                  <div
                    className="coming-popup-chips"
                    role="group"
                    aria-labelledby="coming-quick-label"
                  >
                    {COMING_CHIPS.map(({ id: chipId, label }) => (
                      <button
                        key={chipId}
                        type="button"
                        className={chip === chipId ? "on" : ""}
                        aria-pressed={chip === chipId}
                        disabled={chipUnavailable(chipId)}
                        onClick={() => applyChip(chipId)}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                  <p className="coming-late-hint">
                    {t("table.im_coming_late_hint", { min: maxLateArrivalMin })}
                  </p>
                </div>

                <div className="coming-popup-rules">
                  <p className="coming-popup-rules-title">
                    {t("table.im_coming_confirm_rules")}
                  </p>
                  <ul>
                    {rules.ownerFromNeedsFreeTable ? (
                      <>
                        <li>
                          {t("table.rule_you_from_if_free", {
                            time: formatClock(rules.ownerFrom),
                          })}
                        </li>
                        <li className="coming-popup-rule-emphasis">
                          {t("table.rule_ready_for_you", { time: formatClock(readyAt) })}
                        </li>
                      </>
                    ) : (
                      <li className="coming-popup-rule-emphasis">
                        {t("table.rule_you_from", { time: formatClock(rules.ownerFrom) })}
                      </li>
                    )}
                  </ul>
                </div>

                {error ? (
                  <p className="web-book-error" role="alert">
                    {error}
                  </p>
                ) : null}

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
    </div>,
    document.body,
  );
}
