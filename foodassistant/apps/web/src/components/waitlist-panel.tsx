"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchMyWaitlist,
  fetchWaitlistSummary,
  getToken,
  joinWaitlist,
  leaveWaitlist,
  type WaitlistEntry,
  type WaitlistSummary,
} from "@/lib/api";
import { FLOOR_ZONE_PRESETS, zoneLabel } from "@/lib/floor-zones";

const POLL_MS = 20000;

function waitLabel(minutes: number): string {
  if (minutes <= 0) return "ждать почти не придётся";
  if (minutes < 60) return `≈ ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `≈ ${hours} ч ${rest} мин` : `≈ ${hours} ч`;
}

export function WaitlistPanel({
  venueId,
  zones = [],
  onAuthRequired,
}: {
  venueId: string;
  zones?: string[];
  onAuthRequired?: () => void;
}) {
  const [summary, setSummary] = useState<WaitlistSummary | null>(null);
  const [entry, setEntry] = useState<WaitlistEntry | null>(null);
  const [guests, setGuests] = useState(2);
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWaitlistSummary(venueId);
      setSummary(next);
    } catch {
      setSummary(null);
    }
    if (!getToken()) {
      setEntry(null);
      return;
    }
    try {
      const mine = await fetchMyWaitlist();
      const active = mine.find(
        (item) =>
          item.venue_id === venueId &&
          (item.status === "WAITING" || item.status === "READY"),
      );
      setEntry(active ?? null);
    } catch {
      setEntry(null);
    }
  }, [venueId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function join() {
    setError(null);
    if (!getToken()) {
      onAuthRequired?.();
      setError("Войдите, чтобы встать в очередь");
      return;
    }
    setBusy(true);
    try {
      const created = await joinWaitlist({
        venue_id: venueId,
        guests,
        phone: phone.trim() || undefined,
        zone: zone || undefined,
      });
      setEntry(created);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("Вы уже в очереди этого заведения");
        await refresh();
      } else if (e instanceof ApiError && e.status === 401) {
        onAuthRequired?.();
        setError("Войдите, чтобы встать в очередь");
      } else {
        setError("Не удалось встать в очередь");
      }
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await leaveWaitlist(entry.id);
      setEntry(null);
      await refresh();
    } catch {
      setError("Не удалось выйти из очереди");
    } finally {
      setBusy(false);
    }
  }

  if (entry) {
    const ready = entry.status === "READY";
    return (
      <section className={`waitlist-card ${ready ? "ready" : ""}`}>
        <div className="waitlist-head">
          <h3>{ready ? "Ваш стол готов" : "Вы в очереди"}</h3>
          {!ready && entry.position ? (
            <span className="waitlist-position">№{entry.position}</span>
          ) : null}
        </div>
        {ready ? (
          <p>
            Подойдите к хостес
            {entry.table_number ? ` · стол №${entry.table_number}` : ""}. Место
            держим ограниченное время.
          </p>
        ) : (
          <p>
            {(entry.quoted_wait_min ?? 0) > 0
              ? `Ожидание ${waitLabel(entry.quoted_wait_min ?? 0)}`
              : "Стол освободится с минуты на минуту"}{" "}
            · {entry.guests} гост.
            {entry.zone ? ` · ${zoneLabel(entry.zone)}` : ""}
          </p>
        )}
        <p className="waitlist-hint">
          Статус обновляется автоматически. Можно закрыть страницу — мы сохраним
          место.
        </p>
        {error && <p className="waitlist-error">{error}</p>}
        <button
          type="button"
          className="waitlist-btn ghost"
          disabled={busy}
          onClick={() => void leave()}
        >
          Выйти из очереди
        </button>
      </section>
    );
  }

  const waiting = summary?.waiting ?? 0;
  const free = summary?.free_tables ?? 0;
  const zoneOptions =
    zones.length > 1 ? zones : FLOOR_ZONE_PRESETS.map((preset) => preset.id);

  // Only useful when the room is full, or when a queue has already formed.
  if (!summary || (free > 0 && waiting === 0)) return null;

  return (
    <section className="waitlist-card">
      <div className="waitlist-head">
        <h3>{free > 0 ? "Живая очередь" : "Свободных столов нет"}</h3>
        {waiting > 0 ? (
          <span className="waitlist-position">{waiting} в очереди</span>
        ) : null}
      </div>
      <p>
        Встаньте в виртуальную очередь — придёт статус, когда стол освободится.{" "}
        {summary.quoted_wait_min > 0
          ? `Ожидание ${waitLabel(summary.quoted_wait_min)}.`
          : "Сейчас ждать почти не придётся."}
      </p>
      <div className="waitlist-form">
        <label>
          Гостей
          <input
            type="number"
            min={1}
            max={20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          Телефон
          <input
            type="tel"
            placeholder="+373…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          Зона
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Любая</option>
            {zoneOptions.map((id) => (
              <option key={id} value={id}>
                {zoneLabel(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="waitlist-error">{error}</p>}
      <button
        type="button"
        className="waitlist-btn primary"
        disabled={busy}
        onClick={() => void join()}
      >
        {busy ? "Встаём…" : "Встать в очередь"}
      </button>
    </section>
  );
}
