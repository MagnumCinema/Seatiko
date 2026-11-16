"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchTables,
  fetchVenueSchedule,
  fetchVenues,
  pickLocale,
  type Table,
  type Venue,
  type VenueScheduleSlot,
} from "@/lib/api";
import { addLocalDays, parseOpeningHours, startOfLocalDay } from "@/lib/booking-slots";
import { venueBookingHref } from "@/lib/booking-link";
import { matchesVenueQuery } from "@/lib/venue-filters";
import { emptyKind, partitionQuickBookResults } from "@/lib/quick-book-partition";
import { getVenueHours } from "@/lib/venue-hours";
import { resolveBookingRules } from "@/lib/venue-rules";
import { availabilityRank, venueAvailability, type VenueAvailability } from "@/lib/venue-availability";
import { getSiteCopy } from "@/lib/site-copy";
import { BookingPopup } from "@/components/booking-popup";
import { QuickBookEmpty } from "@/components/quick-book-empty";
import { QuickBookFilters } from "@/components/quick-book-filters";
import { QuickBookFind } from "@/components/quick-book-find";
import { QuickBookResultCard } from "@/components/quick-book-result-card";
import { useLocale } from "@/components/locale-provider";

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
  const textMatchIds = searching
    ? new Set(
        results.filter((r) => matchesVenueQuery(r.venue, query.text)).map((r) => r.venue.id),
      )
    : undefined;
  const { matched, available, unavailable, tooSmall, cards } = partitionQuickBookResults({
    results,
    searching,
    queryText: query.text,
    textMatchIds,
  });
  const kind = emptyKind({
    loading,
    failed,
    searching,
    matchedCount: matched.length,
    availableCount: available.length,
    tooSmallCount: tooSmall.length,
    resultsCount: results.length,
  });

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

      <QuickBookFind value={query.text} onChange={(text) => update({ text })} />

      <QuickBookFilters
        guests={query.guests}
        day={query.day}
        time={query.time}
        duration={query.duration}
        daysAhead={DAYS_AHEAD}
        durations={DURATIONS}
        timeOptions={TIME_OPTIONS}
        dayLabel={dayLabel}
        durationLabel={durationLabel}
        clock={clock}
        onChange={(patch) => update(patch)}
      />

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

      {loading ? (
        <div className="qb-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="qb-card qb-card-skeleton" />
          ))}
        </div>
      ) : (
        <>
          <QuickBookEmpty
            kind={kind}
            failed={failed}
            guests={query.guests}
            timeIsAsap={query.time === "asap"}
            canNextDay={query.day < DAYS_AHEAD - 1}
            onRetry={() => {
              setLoading(true);
              setFailed(false);
              setReloadKey((k) => k + 1);
            }}
            onClearSearch={() => update({ text: "" })}
            onTryAsap={() => update({ time: "asap" })}
            onTryNextDay={() => update({ day: query.day + 1 })}
          />

          <div className="qb-grid">
            {cards.map((row) => (
              <QuickBookResultCard
                key={row.venue.id}
                venue={row.venue}
                availability={row.availability}
                laterToday={row.laterToday}
                guests={query.guests}
                durationMin={query.duration}
                dayLabel={dayLabel(query.day)}
                target={target}
                cuisineLabels={cuisineLabels}
                onPickSlot={(time, durationMin) =>
                  setPopup({ venue: row.venue, time, durationMin, nonce: Date.now() })
                }
                onPickOtherDay={(durationMin) =>
                  setPopup({ venue: row.venue, time: null, durationMin, nonce: Date.now() })
                }
              />
            ))}
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
