"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchAvailability,
  fetchTables,
  fetchVenues,
  pickLocale,
  type ApiVenueAvailability,
  type Table,
  type Venue,
} from "@/lib/api";
import { addLocalDays, startOfLocalDay } from "@/lib/booking-slots";
import { venueBookingHref } from "@/lib/booking-link";
import { matchesVenueQuery } from "@/lib/venue-filters";
import { emptyKind, partitionQuickBookResults } from "@/lib/quick-book-partition";
import { fromApiAvailability } from "@/lib/venue-availability";
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
  const [found, setFound] = useState<ApiVenueAvailability[]>([]);
  const [tablesByVenue, setTablesByVenue] = useState<Record<string, Table[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => {
    let alive = true;
    fetchVenues("city-balti")
      .then((list) => {
        if (alive) setVenues(list);
      })
      .catch(() => {
        if (alive) setFailed(true);
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

  // One server call answers the whole search (GET /availability); refetched when the query changes.
  useEffect(() => {
    const controller = new AbortController();
    const date = `${searchDay.getFullYear()}-${String(searchDay.getMonth() + 1).padStart(2, "0")}-${String(searchDay.getDate()).padStart(2, "0")}`;
    fetchAvailability(
      { cityId: "city-balti", at: target, date, guests: query.guests, durationMin: query.duration },
      controller.signal,
    )
      .then((list) => {
        setFound(list);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error(err);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [searchDay, target, query.guests, query.duration, reloadKey]);

  const results = useMemo(() => {
    const byId = new Map(venues.map((venue) => [venue.id, venue]));
    return found.flatMap((api, index) => {
      const venue = byId.get(api.venue_id);
      if (!venue) return [];
      return [{ venue, ...fromApiAvailability(api, target), rank: index }];
    });
  }, [venues, found, target]);

  function openPopup(next: Omit<PopupState, "nonce">) {
    setPopup({ ...next, nonce: Date.now() });
    if (tablesByVenue[next.venue.id]) return;
    fetchTables(next.venue.id)
      .catch(() => [] as Table[])
      .then((tables) => setTablesByVenue((prev) => ({ ...prev, [next.venue.id]: tables })));
  }

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
                onPickSlot={(time, durationMin) => openPopup({ venue: row.venue, time, durationMin })}
                onPickOtherDay={(durationMin) => openPopup({ venue: row.venue, time: null, durationMin })}
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

      {popup && tablesByVenue[popup.venue.id] ? (
        <BookingPopup
          key={`${popup.venue.id}-${popup.nonce}`}
          venue={popup.venue}
          table={null}
          tables={tablesByVenue[popup.venue.id]}
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
