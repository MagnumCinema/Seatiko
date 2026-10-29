"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TableFloorPlan } from "@/components/table-floor-plan";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { useLocale } from "@/components/locale-provider";
import { listZonesFromTables } from "@/lib/floor-zones";
import {
  ApiError,
  createReservation,
  fetchTables,
  fetchVenue,
  getToken,
  login,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  register,
  type Table,
  type Venue,
} from "@/lib/api";

export function WebBooking({ venueId }: { venueId: string }) {
  const { locale, t } = useLocale();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState<Table | null>(null);
  const [guests, setGuests] = useState(2);
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setLoading(true);
    });
    Promise.all([fetchVenue(venueId), fetchTables(venueId)])
      .then(([v, tb]) => {
        if (!alive) return;
        setVenue(v);
        setTables(tb);
      })
      .catch(() => {
        if (alive) setError("not_found");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [venueId]);

  const freeCount = useMemo(
    () => tables.filter((table) => table.status === "FREE").length,
    [tables],
  );
  const zones = useMemo(() => listZonesFromTables(tables), [tables]);
  const photo = venue?.image_url || venue?.photo_urls?.[0] || "";

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
    if (!selected || !venue) return;
    setError(null);
    if (!(await ensureAuth())) return;
    setBusy(true);
    try {
      await createReservation({
        venue_id: venue.id,
        table_id: selected.id,
        guests,
        reserved_for: new Date(time).toISOString(),
      });
      setDone(true);
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

  if (loading) {
    return <div className="venue-page-loading">{t("venue.loading")}</div>;
  }

  if (!venue) {
    return (
      <div className="venue-page-empty">
        <h1>{error === "not_found" ? t("venue.not_found") : error || t("venue.not_found")}</h1>
        <Link href="/">{t("venue.back_map")}</Link>
      </div>
    );
  }

  const venueName = pickLocale(venue.name, locale);

  if (done) {
    return (
      <div className="web-book-done">
        <p className="venue-page-kicker">{t("venue.book")}</p>
        <h1>Бронь подтверждена</h1>
        <p>
          {venueName} · стол №{selected?.number} · {guests} ·{" "}
          {new Date(time).toLocaleString(locale)}
        </p>
        <p className="web-book-muted">
          История броней — в приложении (тот же email) или после входа на сайте.
        </p>
        <div className="web-book-actions">
          <Link className="venue-cta venue-cta-primary" href={`/venues/${venue.id}`}>
            К ресторану
          </Link>
          <Link className="venue-cta ghost" href="/">
            {t("venue.back_map")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="web-book venue-page-wrap">
      <nav className="venue-breadcrumb" aria-label="Breadcrumb">
        <Link href={`/venues/${venue.id}`}>← {venueName}</Link>
        <span aria-hidden>/</span>
        <span>{t("venue.book")}</span>
        <Link href="/" className="web-book-map-link">
          {t("nav.map")}
        </Link>
      </nav>

      <section className="venue-hero web-book-hero">
        <div className="venue-hero-media">
          <div className="venue-hero-frame">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(photo)} alt={venueName} />
            ) : (
              <div className="venue-hero-fallback" />
            )}
            <div className="venue-hero-overlays">
              <span className={`venue-status-badge ${venue.open_now ? "open" : "closed"}`}>
                {venue.open_now ? t("venue.open") : t("venue.closed")}
              </span>
            </div>
            <div className="venue-free-float">
              <b>{freeCount}</b>
              <span>{t("venue.free_tables")}</span>
            </div>
          </div>
        </div>

        <div className="venue-hero-copy">
          <p className="venue-page-kicker">{t("venue.book")}</p>
          <h1>{venueName}</h1>
          <p className="venue-page-address">⌖ {pickLocale(venue.address, locale)}</p>
          <div className="venue-rating-row">
            <strong>★ {venue.rating.toFixed(1)}</strong>
            <span>
              {venue.cuisine?.slice(0, 3).join(" · ")} · {priceLevelLabel(venue.price_level)}
            </span>
          </div>
          <p className="venue-page-desc">{pickLocale(venue.description, locale)}</p>
          <div className="venue-page-actions">
            <Link className="venue-cta ghost" href={`/venues/${venue.id}/menu`}>
              {t("venue.menu")}
            </Link>
            <Link className="venue-cta ghost" href={`/venues/${venue.id}`}>
              К ресторану
            </Link>
          </div>
        </div>
      </section>

      <section className="web-book-main venue-section">
        <div className="web-book-floor">
          <div className="venue-section-head">
            <div>
              <h2>Выберите стол</h2>
              <p>{t("venue.floor_live")}</p>
            </div>
            <div className="venue-floor-legend">
              <span>
                <i className="free" /> {t("floor.leg_free")}
              </span>
              <span>
                <i className="reserved" /> {t("floor.leg_res")}
              </span>
              <span>
                <i className="occupied" /> {t("floor.leg_occ")}
              </span>
            </div>
          </div>
          <div className="venue-floor-stage">
            <TableFloorPlan
              tables={tables}
              selectedId={selected?.id}
              onTableClick={(table) => {
                if (table.status === "FREE") setSelected(table);
              }}
            />
          </div>
        </div>

        <aside className="web-book-side">
          <h2>Детали брони</h2>
          <label>
            Стол
            <input
              readOnly
              value={
                selected
                  ? `№${selected.number} · ${selected.seats} мест`
                  : "Выберите на плане"
              }
            />
          </label>
          <label>
            Гостей
            <input
              type="number"
              min={1}
              max={selected?.seats || 20}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Дата и время
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {error && error !== "not_found" && (
            <p className="web-book-error">{error}</p>
          )}
          <button
            type="button"
            className="venue-cta venue-cta-primary"
            disabled={!selected || busy}
            onClick={() => void book()}
          >
            {busy ? "Бронируем…" : t("res.confirm_book")}
          </button>
          <p className="web-book-muted tiny">
            Нужен аккаунт: история броней, чеки и повторные визиты.
          </p>
          <WaitlistPanel
            venueId={venue.id}
            zones={zones}
            onAuthRequired={() => setAuthOpen(true)}
          />
        </aside>
      </section>

      {authOpen && (
        <div className="web-book-auth" role="dialog" aria-modal>
          <div className="web-book-auth-card">
            <h3>{authMode === "login" ? t("auth.login") : t("auth.register")}</h3>
            <p className="web-book-muted">{t("auth.body")}</p>
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
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
