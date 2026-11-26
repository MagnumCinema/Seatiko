"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useLocale,
  type Locale,
  type MessageKey,
} from "@/components/locale-provider";
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
import { SelectMenu } from "@/components/ui/select-menu";

const POLL_MS = 20000;

function waitLabel(
  minutes: number,
  locale: Locale,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  if (minutes <= 0) return t("waitlist.wait_almost_none");
  const pr = new Intl.PluralRules(locale);
  const minKey = `waitlist.minutes_${pr.select(minutes)}` as MessageKey;
  if (minutes < 60) return `≈ ${t(minKey, { count: minutes })}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hrKey = `waitlist.hours_${pr.select(hours)}` as MessageKey;
  const hrText = t(hrKey, { count: hours });
  if (rest) {
    const restKey = `waitlist.minutes_${pr.select(rest)}` as MessageKey;
    const restText = t(restKey, { count: rest });
    return `≈ ${hrText} ${restText}`;
  }
  return `≈ ${hrText}`;
}

export function WaitlistPanel({
  venueId,
  zones = [],
  onAuthRequired,
  forceShow = false,
}: {
  venueId: string;
  zones?: string[];
  onAuthRequired?: () => void;
  forceShow?: boolean;
}) {
  const { locale, t } = useLocale();
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
    queueMicrotask(() => {
      void refresh();
    });
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function join() {
    setError(null);
    if (!getToken()) {
      onAuthRequired?.();
      setError(t("waitlist.err_login"));
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
        setError(t("waitlist.err_already_in_queue"));
        await refresh();
      } else if (e instanceof ApiError && e.status === 401) {
        onAuthRequired?.();
        setError(t("waitlist.err_login"));
      } else {
        setError(t("waitlist.err_join_failed"));
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
      setError(t("waitlist.err_leave_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (entry) {
    const ready = entry.status === "READY";
    const guestsKey = `waitlist.guests_${new Intl.PluralRules(locale).select(entry.guests)}` as MessageKey;
    return (
      <section className={`waitlist-card ${ready ? "ready" : ""}`}>
        <div className="waitlist-head">
          <h3>
            {ready ? t("waitlist.title_ready") : t("waitlist.title_in_queue")}
          </h3>
          {!ready && entry.position ? (
            <span className="waitlist-position">
              {t("waitlist.position", { position: entry.position })}
            </span>
          ) : null}
        </div>
        {ready ? (
          <p>
            {t("waitlist.ready_desc", {
              table: entry.table_number
                ? t("waitlist.ready_table", { table: entry.table_number })
                : "",
            })}
          </p>
        ) : (
          <p>
            {(entry.quoted_wait_min ?? 0) > 0
              ? t("waitlist.quoted_wait", {
                  wait: waitLabel(entry.quoted_wait_min ?? 0, locale, t),
                })
              : t("waitlist.table_free_soon")}{" "}
            · {t(guestsKey, { count: entry.guests })}
            {entry.zone ? ` · ${zoneLabel(entry.zone, locale)}` : ""}
          </p>
        )}
        <p className="waitlist-hint">{t("waitlist.hint")}</p>
        {error && <p className="waitlist-error">{error}</p>}
        <button
          type="button"
          className="btn btn--secondary btn--md"
          disabled={busy}
          onClick={() => void leave()}
        >
          {t("waitlist.leave")}
        </button>
      </section>
    );
  }

  const waiting = summary?.waiting ?? 0;
  const free = summary?.free_tables ?? 0;
  const zoneOptions =
    zones.length > 1 ? zones : FLOOR_ZONE_PRESETS.map((preset) => preset.id);

  // Only useful when the room is full, or when a queue has already formed, unless forceShow is true.
  if (!forceShow && (!summary || (free > 0 && waiting === 0))) return null;

  const quotedWait = summary?.quoted_wait_min ?? 0;
  const inQueueKey = `waitlist.in_queue_${new Intl.PluralRules(locale).select(waiting)}` as MessageKey;

  return (
    <section className="waitlist-card">
      <div className="waitlist-head">
        <h3>
          {waiting > 0
            ? t("waitlist.title_queue")
            : free === 0
              ? t("waitlist.title_no_tables")
              : t("waitlist.title_waitlist")}
        </h3>
        {waiting > 0 ? (
          <span className="waitlist-position">
            {t(inQueueKey, { count: waiting })}
          </span>
        ) : null}
      </div>
      <p>
        {waiting > 0
          ? `${t("waitlist.desc_queue_lead")} ${
              quotedWait > 0
                ? t("waitlist.quoted_wait_dot", {
                    wait: waitLabel(quotedWait, locale, t),
                  })
                : t("waitlist.wait_almost_none_dot")
            }`
          : free === 0
            ? t("waitlist.desc_occupied")
            : t("waitlist.desc_waitlist")}
      </p>
      <div className="waitlist-form">
        <label>
          {t("waitlist.label_guests")}
          <input
            type="number"
            min={1}
            max={20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          {t("waitlist.label_phone")}
          <input
            type="tel"
            placeholder={t("waitlist.phone_placeholder")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          {t("waitlist.label_zone")}
          <SelectMenu
            value={zone}
            onChange={setZone}
            options={[
              { value: "", label: t("waitlist.zone_any") },
              ...zoneOptions.map((id) => ({
                value: id,
                label: zoneLabel(id, locale),
              })),
            ]}
          />
        </label>
      </div>
      {error && <p className="waitlist-error">{error}</p>}
      <button
        type="button"
        className="btn btn--primary btn--md"
        disabled={busy}
        onClick={() => void join()}
      >
        {busy ? t("waitlist.joining") : t("waitlist.join")}
      </button>
    </section>
  );
}
