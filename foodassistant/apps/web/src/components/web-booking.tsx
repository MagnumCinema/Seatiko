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
  const { locale } = useLocale();
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
    setLoading(true);
    Promise.all([
      fetchVenue(venueId),
      fetchTables(venueId),
    ])
      .then(([v, tb]) => {
        if (!alive) return;
        setVenue(v);
        setTables(tb);
      })
      .catch(() => {
        if (alive) setError("Ресторан не найден");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [venueId]);

  const freeCount = useMemo(
    () => tables.filter((t) => t.status === "FREE").length,
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
      setError(e instanceof ApiError ? e.code : "Ошибка входа");
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
        setError(e instanceof ApiError ? e.code : "Не удалось забронировать");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="web-book-loading">Загружаем ресторан…</div>;
  }
  if (!venue) {
    return (
      <div className="web-book-loading">
        <p>{error || "Ресторан не найден"}</p>
        <Link href="/">На карту</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="web-book-done">
        <h1>Бронь подтверждена</h1>
        <p>
          {pickLocale(venue.name, locale)} · стол №{selected?.number} ·{" "}
          {guests} гост. · {new Date(time).toLocaleString()}
        </p>
        <p className="web-book-muted">
          История броней — в приложении (тот же email) или после входа на сайте.
        </p>
        <div className="web-book-actions">
          <Link className="web-book-btn primary" href={`/venues/${venue.id}`}>
            К ресторану
          </Link>
          <Link className="web-book-btn ghost" href="/">
            На карту
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="web-book">
      <div className="web-book-top">
        <Link href={`/venues/${venue.id}`} className="web-book-back">
          ← {pickLocale(venue.name, locale)}
        </Link>
        <Link href="/" className="web-book-back muted">
          Карта
        </Link>
      </div>

      <section className="web-book-hero">
        <div
          className="web-book-hero-media"
          style={
            photo
              ? { backgroundImage: `url(${mediaUrl(photo)})` }
              : undefined
          }
        />
        <div className="web-book-hero-copy">
          <p className="web-book-kicker">Бронирование на сайте</p>
          <h1>{pickLocale(venue.name, locale)}</h1>
          <p>
            ★ {venue.rating} · {venue.cuisine?.slice(0, 3).join(", ")} ·{" "}
            {priceLevelLabel(venue.price_level)}
          </p>
          <p className="web-book-muted">{pickLocale(venue.address, locale)}</p>
          <span className="web-book-pill">{freeCount} столов свободно</span>
          <p>{pickLocale(venue.description, locale)}</p>
          <div className="web-book-hero-actions">
            <Link
              className="web-book-btn ghost"
              href={`/venues/${venue.id}/menu`}
            >
              Открыть меню
            </Link>
          </div>
        </div>
      </section>

      <section className="web-book-main">
        <div className="web-book-floor">
          <div className="web-book-section-head">
            <h2>Выберите стол</h2>
            <p>Зал, улица или терраса — переключайте вкладки на плане</p>
          </div>
          <TableFloorPlan
            tables={tables}
            selectedId={selected?.id}
            onTableClick={(table) => {
              if (table.status === "FREE") setSelected(table);
            }}
          />
        </div>

        <aside className="web-book-side">
          <h2>Детали брони</h2>
          <label>
            Стол
            <input
              readOnly
              value={selected ? `№${selected.number} · ${selected.seats} мест` : "Выберите на плане"}
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
          {error && <p className="web-book-error">{error}</p>}
          <button
            type="button"
            className="web-book-btn primary"
            disabled={!selected || busy}
            onClick={() => void book()}
          >
            {busy ? "Бронируем…" : "Подтвердить бронь"}
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
            <h3>{authMode === "login" ? "Войти" : "Регистрация"}</h3>
            <p className="web-book-muted">Чтобы сохранить бронь в аккаунте</p>
            {authMode === "register" && (
              <>
                <input
                  placeholder="Имя"
                  value={authForm.first_name}
                  onChange={(e) =>
                    setAuthForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                />
                <input
                  placeholder="Фамилия"
                  value={authForm.last_name}
                  onChange={(e) =>
                    setAuthForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                />
              </>
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) =>
                setAuthForm((f) => ({ ...f, email: e.target.value }))
              }
            />
            <input
              type="password"
              placeholder="Пароль"
              value={authForm.password}
              onChange={(e) =>
                setAuthForm((f) => ({ ...f, password: e.target.value }))
              }
            />
            {error && <p className="web-book-error">{error}</p>}
            <button
              type="button"
              className="web-book-btn primary"
              disabled={busy}
              onClick={() => void submitAuth()}
            >
              {authMode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
            <button
              type="button"
              className="web-book-btn ghost"
              onClick={() =>
                setAuthMode((m) => (m === "login" ? "register" : "login"))
              }
            >
              {authMode === "login" ? "Создать аккаунт" : "Уже есть аккаунт?"}
            </button>
            <button
              type="button"
              className="web-book-btn ghost"
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
