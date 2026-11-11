"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchTables,
  fetchVenueSchedule,
  fetchVenues,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  type Table,
  type Venue,
  type VenueScheduleSlot,
} from "@/lib/api";
import { addLocalDays, parseOpeningHours, startOfLocalDay } from "@/lib/booking-slots";
import { venueBookingHref } from "@/lib/booking-link";
import { matchesVenueQuery } from "@/lib/venue-filters";
import { getVenueHours } from "@/lib/venue-hours";
import { resolveBookingRules } from "@/lib/venue-rules";
import { availabilityRank, venueAvailability, type VenueAvailability } from "@/lib/venue-availability";
import { getSiteCopy } from "@/lib/site-copy";
import { BookingPopup } from "@/components/booking-popup";
import { useLocale } from "@/components/locale-provider";
import { SearchIcon, SparklesIcon } from "@/components/venue-icons";

const DAYS_AHEAD = 7;
const MAX_GUESTS = 20;
const DURATIONS = [60, 90, 120, 180];
const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const min = 10 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});
const REFRESH_MS = 60_000;

type VenueData = { tables: Table[]; schedule: VenueScheduleSlot[] };
type Query = { guests: number; day: number; time: string; duration: number; text: string };
type PopupState = { venue: Venue; time: string | null; durationMin: number; nonce: number };

function readQuery(p: Pick<URLSearchParams, "get">): Query {
  const fallback: Query = { guests: 2, day: 0, time: "asap", duration: 90, text: "" };
  const guests = Number(p.get("guests"));
  const day = Number(p.get("day"));
  const duration = Number(p.get("duration"));
  const time = p.get("time") ?? "";
  return {
    guests: Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS ? guests : fallback.guests,
    day: Number.isInteger(day) && day >= 0 && day < DAYS_AHEAD ? day : fallback.day,
    time: TIME_OPTIONS.includes(time) ? time : fallback.time,
    duration: DURATIONS.includes(duration) ? duration : fallback.duration,
    text: (p.get("q") ?? "").slice(0, 80),
  };
}

function writeQuery(q: Query) {
  const url = new URL(window.location.href);
  url.searchParams.set("guests", String(q.guests));
  url.searchParams.set("day", String(q.day));
  url.searchParams.set("time", q.time);
  url.searchParams.set("duration", String(q.duration));
  if (q.text.trim()) url.searchParams.set("q", q.text);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
}

/** /book — "where is a table free for N guests at this time?" across all venues. */
export function QuickBookSearch() {
  const { locale, t } = useLocale();
  const cuisineLabels: Record<string, string> = getSiteCopy(locale).catalog.cuisines;
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<Query>(() => readQuery(searchParams));
  const [now, setNow] = useState(() => new Date());
  const [venues, setVenues] = useState<Venue[]>([]);
  const [data, setData] = useState<Record<string, VenueData>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => {
    let alive = true;
    fetchVenues("city-balti")
      .then(async (list) => {
        const entries = await Promise.all(
          list.map(async (venue) => {
            const [tables, schedule] = await Promise.all([
              fetchTables(venue.id).catch(() => [] as Table[]),
              fetchVenueSchedule(venue.id).catch(() => [] as VenueScheduleSlot[]),
            ]);
            return [venue.id, { tables, schedule }] as const;
          }),
        );
        if (!alive) return;
        setVenues(list);
        setData(Object.fromEntries(entries));
        setFailed(false);
        setNow(new Date());
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setReloadKey((key) => key + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  function update(patch: Partial<Query>) {
    const next = { ...query, ...patch };
    setQuery(next);
    writeQuery(next);
  }

  const searchDay = useMemo(() => addLocalDays(startOfLocalDay(now), query.day), [now, query.day]);
  const target = useMemo(() => {
    if (query.time === "asap") return null;
    const [h, m] = query.time.split(":").map(Number);
    return new Date(searchDay.getFullYear(), searchDay.getMonth(), searchDay.getDate(), h, m);
  }, [searchDay, query.time]);

  const results = useMemo(() => {
    return venues
      .map((venue) => {
        const venueData = data[venue.id] ?? { tables: [], schedule: [] };
        const input = {
          rules: resolveBookingRules(venue),
          hours: parseOpeningHours(getVenueHours(venue.id, "ru")),
          tables: venueData.tables,
          schedule: venueData.schedule,
        };
        const base = { day: searchDay, now, guests: query.guests, durationMin: query.duration };
        const availability: VenueAvailability = venueAvailability({ ...input, query: { ...base, target } });
        const laterToday =
          target && availability.fits && availability.slots.length === 0
            ? venueAvailability({ ...input, query: { ...base, target: null } })
            : null;
        return { venue, availability, laterToday, rank: availabilityRank(availability, target) };
      })
      .sort((a, b) => a.rank - b.rank || b.venue.rating - a.venue.rating);
  }, [venues, data, searchDay, now, query.guests, query.duration, target]);

  const searching = query.text.trim().length > 0;
  const matched = searching ? results.filter((r) => matchesVenueQuery(r.venue, query.text)) : results;
  const available = matched.filter((r) => r.availability.slots.length > 0);
  const unavailable = matched.filter((r) => r.availability.fits && r.availability.slots.length === 0);
  const tooSmall = matched.filter((r) => !r.availability.fits);
  const cards = searching ? matched : available;

  const clock = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (offset: number) => {
    if (offset === 0) return t("res.today");
    if (offset === 1) return t("res.tomorrow");
    return addLocalDays(startOfLocalDay(now), offset).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
    });
  };
  const durationLabel = (min: number) =>
    t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) });
  const summary = t("qb.summary", {
    guests: query.guests,
    day: dayLabel(query.day).toLowerCase(),
    time: target ? clock(target) : t("qb.time_asap").toLowerCase(),
    duration: durationLabel(query.duration),
  });

  return (
    <div className="venue-page-wrap qb">
      <header className="qb-hero">
        <p className="venue-page-kicker">{t("qb.kicker")}</p>
        <h1>{t("qb.title")}</h1>
        <p className="qb-lead">{t("qb.lead")}</p>
      </header>

      <div className="catalog-search-row qb-find">
        <div className="catalog-search-wrap">
          <SearchIcon />
          <input
            type="search"
            className="catalog-search-input"
            placeholder={t("qb.find_placeholder")}
            value={query.text}
            maxLength={80}
            onChange={(e) => update({ text: e.target.value })}
            aria-label={t("qb.find_label")}
          />
          {query.text ? (
            <button
              type="button"
              className="catalog-search-clear"
              onClick={() => update({ text: "" })}
              aria-label={t("qb.find_clear")}
            >
              ✕
            </button>
          ) : null}
        </div>
        <Link href="/discover" className="catalog-discover-btn">
          <SparklesIcon />
          <span>{t("qb.discover")}</span>
        </Link>
      </div>

      <section className="qb-search" aria-label={t("qb.search_label")}>
        <div className="qb-field">
          <span className="booking-field-label" id="qb-guests-label">
            {t("res.guests")}
          </span>
          <div className="booking-stepper" role="group" aria-labelledby="qb-guests-label">
            <button
              type="button"
              aria-label={t("res.guests_less")}
              disabled={query.guests <= 1}
              onClick={() => update({ guests: query.guests - 1 })}
            >
              −
            </button>
            <output aria-live="polite">{query.guests}</output>
            <button
              type="button"
              aria-label={t("res.guests_more")}
              disabled={query.guests >= MAX_GUESTS}
              onClick={() => update({ guests: query.guests + 1 })}
            >
              +
            </button>
          </div>
        </div>

        <div className="qb-field qb-field-days">
          <span className="booking-field-label">{t("res.day")}</span>
          <div className="booking-slot-days">
            {Array.from({ length: DAYS_AHEAD }, (_, offset) => (
              <button
                key={offset}
                type="button"
                className={offset === query.day ? "on" : ""}
                aria-pressed={offset === query.day}
                onClick={() => update({ day: offset })}
              >
                {dayLabel(offset)}
              </button>
            ))}
          </div>
        </div>

        <label className="qb-field">
          <span className="booking-field-label">{t("res.time")}</span>
          <select
            className="qb-select"
            value={query.time}
            onChange={(e) => update({ time: e.target.value })}
          >
            <option value="asap">{t("qb.time_asap")}</option>
            {TIME_OPTIONS.map((time) => {
              const [h, m] = time.split(":").map(Number);
              return (
                <option key={time} value={time}>
                  {clock(new Date(2000, 0, 1, h, m))}
                </option>
              );
            })}
          </select>
        </label>

        <div className="qb-field">
          <span className="booking-field-label">{t("res.duration")}</span>
          <div className="booking-slot-days">
            {DURATIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={min === query.duration ? "on" : ""}
                aria-pressed={min === query.duration}
                onClick={() => update({ duration: min })}
              >
                {durationLabel(min)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="qb-results-head">
        <div>
          <h2>
            {loading
              ? t("qb.searching")
              : searching
                ? matched.length
                  ? t("qb.found_text", { count: matched.length, text: query.text.trim() })
                  : t("qb.nothing_text", { text: query.text.trim() })
                : available.length
                  ? t("qb.found", { count: available.length })
                  : t("qb.none_title")}
          </h2>
          <p>{summary}</p>
        </div>
        <Link href="/venues" className="qb-catalog-link">
          {t("qb.catalog_link")} →
        </Link>
      </div>

      {failed ? <p className="web-book-error">{t("common.error")}</p> : null}

      {loading ? (
        <div className="qb-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="qb-card qb-card-skeleton" />
          ))}
        </div>
      ) : (
        <>
          {searching && matched.length === 0 ? (
            <div className="qb-empty">
              <p>{t("qb.nothing_body")}</p>
              <div>
                <button type="button" className="venue-cta venue-cta-outline" onClick={() => update({ text: "" })}>
                  {t("qb.find_clear")}
                </button>
                <Link href="/discover" className="venue-cta venue-cta-outline">
                  {t("qb.discover")}
                </Link>
              </div>
            </div>
          ) : searching ? null : available.length === 0 && !failed && tooSmall.length === results.length && results.length ? (
            <div className="qb-empty">
              <p>{t("qb.none_group", { guests: query.guests })}</p>
            </div>
          ) : available.length === 0 && !failed ? (
            <div className="qb-empty">
              <p>{t("qb.none_body")}</p>
              <div>
                {query.time !== "asap" ? (
                  <button type="button" className="venue-cta venue-cta-outline" onClick={() => update({ time: "asap" })}>
                    {t("qb.try_asap")}
                  </button>
                ) : null}
                {query.day < DAYS_AHEAD - 1 ? (
                  <button
                    type="button"
                    className="venue-cta venue-cta-outline"
                    onClick={() => update({ day: query.day + 1 })}
                  >
                    {t("qb.try_next_day")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="qb-grid">
            {cards.map(({ venue, availability, laterToday }) => {
              const shown = availability.slots.length ? availability : laterToday;
              const slots = shown?.slots ?? [];
              const name = pickLocale(venue.name, locale);
              const photo = venue.photo_urls?.[0] || venue.image_url;
              const cuisine = venue.cuisine
                .slice(0, 2)
                .map((c) => cuisineLabels[c] ?? c)
                .join(" · ");
              return (
                <article
                  key={venue.id}
                  className={`qb-card${availability.exact ? " exact" : ""}${slots.length ? "" : " muted"}`}
                >
                  <Link href={`/venues/${venue.id}`} className="qb-card-photo" tabIndex={-1} aria-hidden="true">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(photo)} alt="" loading="lazy" />
                    ) : null}
                  </Link>
                  <div className="qb-card-body">
                    <div className="qb-card-title">
                      <h3>
                        <Link href={`/venues/${venue.id}`}>{name}</Link>
                      </h3>
                      <span className="qb-card-rating">★ {venue.rating.toFixed(1)}</span>
                    </div>
                    <p className="qb-card-meta">
                      {[cuisine, priceLevelLabel(venue.price_level), pickLocale(venue.address, locale)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p
                      className={`qb-card-status${availability.exact ? " exact" : ""}${slots.length ? "" : " none"}`}
                    >
                      {!availability.fits
                        ? t("qb.card_small", { guests: query.guests })
                        : availability.exact
                          ? t("qb.exact", { time: clock(availability.exact.start) })
                          : availability.slots.length
                            ? target
                              ? t("qb.nearest")
                              : t("qb.earliest")
                            : slots.length
                              ? t("qb.later_today", { time: target ? clock(target) : "" })
                              : t("qb.day_full", { day: dayLabel(query.day).toLowerCase() })}
                    </p>
                    <div className="qb-slots" role="group" aria-label={t("qb.slots_label", { venue: name })}>
                      {slots.map((slot) => {
                        const isExact = availability.exact?.start.getTime() === slot.start.getTime();
                        return (
                          <button
                            key={slot.start.toISOString()}
                            type="button"
                            className={isExact ? "on" : ""}
                            onClick={() =>
                              setPopup({
                                venue,
                                time: slot.start.toISOString(),
                                durationMin: shown?.durationMin ?? query.duration,
                                nonce: Date.now(),
                              })
                            }
                          >
                            {clock(slot.start)}
                          </button>
                        );
                      })}
                    </div>
                    {!availability.fits ? (
                      <Link className="qb-card-action" href={venueBookingHref(venue.id, { intent: "event" })}>
                        {t("qb.other_event")} →
                      </Link>
                    ) : !slots.length ? (
                      <button
                        type="button"
                        className="qb-card-action"
                        onClick={() =>
                          setPopup({ venue, time: null, durationMin: availability.durationMin, nonce: Date.now() })
                        }
                      >
                        {t("qb.pick_other_day")} →
                      </button>
                    ) : null}
                    {slots.length && shown && shown.durationMin !== query.duration ? (
                      <p className="qb-card-note">
                        {t("qb.duration_capped", { duration: durationLabel(shown.durationMin) })}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {!searching && (unavailable.length || tooSmall.length) ? (
            <details className="qb-others">
              <summary>{t("qb.others", { count: unavailable.length + tooSmall.length })}</summary>
              <ul>
                {unavailable.map(({ venue }) => (
                  <li key={venue.id}>
                    <Link href={`/venues/${venue.id}`}>{pickLocale(venue.name, locale)}</Link>
                    <span>{t("qb.other_busy")}</span>
                  </li>
                ))}
                {tooSmall.map(({ venue }) => (
                  <li key={venue.id}>
                    <Link href={`/venues/${venue.id}`}>{pickLocale(venue.name, locale)}</Link>
                    <span>
                      {t("qb.other_small", { guests: query.guests })}{" "}
                      <Link href={venueBookingHref(venue.id, { intent: "event" })}>{t("qb.other_event")}</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      {popup ? (
        <BookingPopup
          key={`${popup.venue.id}-${popup.nonce}`}
          venue={popup.venue}
          table={null}
          tables={data[popup.venue.id]?.tables ?? []}
          open
          onClose={() => setPopup(null)}
          onBooked={() => setReloadKey((key) => key + 1)}
          initialGuests={query.guests}
          initialTime={popup.time}
          initialDurationMin={popup.durationMin}
        />
      ) : null}
    </div>
  );
}
