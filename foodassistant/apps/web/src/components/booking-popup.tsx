"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  createReservation,
  getToken,
  login,
  pickLocale,
  register,
  type Table,
  type Venue,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";

export const BOOKING_ANCHOR_ID = "venue-booking";

type BookingPopupProps = {
  venue: Venue;
  table: Table;
  open: boolean;
  onClose: () => void;
  onBooked?: () => void;
};

export function BookingPopup({
  venue,
  table,
  open,
  onClose,
  onBooked,
}: BookingPopupProps) {
  const { locale, t } = useLocale();
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 30, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setGuests(Math.min(2, table.seats));
      setError(null);
      setDone(false);
      setAuthOpen(false);
    });
  }, [open, table.id, table.seats]);

  useEffect(() => {
    if (!open) return;

    const url = new URL(window.location.href);
    if (url.hash !== `#${BOOKING_ANCHOR_ID}`) {
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}#${BOOKING_ANCHOR_ID}`,
      );
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, table.id, onClose]);

  if (!open) return null;

  const venueName = pickLocale(venue.name, locale);

  async function ensureAuth() {
    if (getToken()) return true;
    setAuthOpen(true);
    return false;
  }

  async function submitAuth() {
    setBusy(true);
    setError(null);
    try {
      if (authMode === "register") {
        await register({
          email: authForm.email.trim(),
          password: authForm.password,
          first_name: authForm.first_name.trim(),
          last_name: authForm.last_name.trim(),
          locale,
        });
      } else {
        await login({
          email: authForm.email.trim(),
          password: authForm.password,
        });
      }
      setAuthOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "auth_failed");
    } finally {
      setBusy(false);
    }
  }

  async function book() {
    setError(null);
    if (!(await ensureAuth())) return;
    setBusy(true);
    try {
      await createReservation({
        venue_id: venue.id,
        table_id: table.id,
        guests,
        reserved_for: new Date(time).toISOString(),
      });
      setDone(true);
      onBooked?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthOpen(true);
      } else {
        setError(e instanceof ApiError ? e.code : "book_failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    const url = new URL(window.location.href);
    if (url.hash === `#${BOOKING_ANCHOR_ID}`) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
    onClose();
  }

  return (
    <div className="booking-popup-root" role="presentation">
      <button
        type="button"
        className="booking-popup-backdrop"
        aria-label={t("res.close")}
        onClick={handleClose}
      />
      <section
        id={BOOKING_ANCHOR_ID}
        className="booking-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-popup-title"
      >
        <div className="booking-popup-card">
          {done ? (
            <div className="booking-popup-done">
              <p className="venue-page-kicker">{t("venue.book")}</p>
              <h2 id="booking-popup-title">{t("res.success")}</h2>
              <p>
                {t("res.success_detail", {
                  venue: venueName,
                  table: table.number,
                  guests,
                  time: new Date(time).toLocaleString(locale),
                })}
              </p>
              <p className="web-book-muted">{t("res.success_hint")}</p>
              <button type="button" className="venue-cta venue-cta-primary" onClick={handleClose}>
                {t("res.close")}
              </button>
            </div>
          ) : (
            <>
              <header className="booking-popup-head">
                <div>
                  <p className="venue-page-kicker">{t("venue.book")}</p>
                  <h2 id="booking-popup-title">{t("res.confirm_title")}</h2>
                  <p className="web-book-muted">{venueName}</p>
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
                  {t("res.table")}
                  <input
                    readOnly
                    value={t("res.table_value", { n: table.number, seats: table.seats })}
                  />
                </label>
                <label>
                  {t("res.guests")}
                  <input
                    type="number"
                    min={1}
                    max={table.seats}
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value) || 1)}
                  />
                </label>
                <label>
                  {t("res.datetime")}
                  <input
                    type="datetime-local"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                {error && <p className="web-book-error">{error}</p>}
                <button
                  type="button"
                  className="venue-cta venue-cta-primary"
                  disabled={busy}
                  onClick={() => void book()}
                >
                  {busy ? t("res.booking") : t("res.confirm_book")}
                </button>
                <p className="web-book-muted tiny">{t("res.account_hint")}</p>
              </div>
            </>
          )}

          {authOpen && (
            <div className="booking-popup-auth">
              <h3>{authMode === "login" ? t("auth.login") : t("auth.register")}</h3>
              <p className="web-book-muted">{t("res.auth_save")}</p>
              {authMode === "register" && (
                <>
                  <input
                    placeholder={t("auth.first_name")}
                    value={authForm.first_name}
                    onChange={(e) =>
                      setAuthForm((f) => ({ ...f, first_name: e.target.value }))
                    }
                  />
                  <input
                    placeholder={t("auth.last_name")}
                    value={authForm.last_name}
                    onChange={(e) =>
                      setAuthForm((f) => ({ ...f, last_name: e.target.value }))
                    }
                  />
                </>
              )}
              <input
                type="email"
                placeholder={t("auth.email")}
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <input
                type="password"
                placeholder={t("auth.password")}
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              {error && <p className="web-book-error">{error}</p>}
              <button
                type="button"
                className="venue-cta venue-cta-primary"
                disabled={busy}
                onClick={() => void submitAuth()}
              >
                {authMode === "login" ? t("auth.login") : t("auth.register")}
              </button>
              <button
                type="button"
                className="venue-cta ghost"
                onClick={() =>
                  setAuthMode((m) => (m === "login" ? "register" : "login"))
                }
              >
                {authMode === "login" ? t("auth.switch_register") : t("auth.switch_login")}
              </button>
              <button
                type="button"
                className="venue-cta ghost"
                onClick={() => setAuthOpen(false)}
              >
                {t("res.close")}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
