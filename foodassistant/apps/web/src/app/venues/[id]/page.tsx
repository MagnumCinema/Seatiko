"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TableFloorPlan, TableReserveSheet } from "@/components/table-floor-plan";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { BookingPopup } from "@/components/booking-popup";
import { ComingPopup } from "@/components/coming-popup";
import { VenueDayCalendar } from "@/components/venue-day-calendar";
import { useLocale } from "@/components/locale-provider";
import { listZonesFromTables } from "@/lib/floor-zones";
import {
  fetchMe,
  fetchTables,
  fetchVenue,
  fetchVenuePlaces,
  getToken,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  watchTable,
  type Table,
  type User,
  type Venue,
  type VenuePlaces,
} from "@/lib/api";
import {
  addFavoriteVenue,
  loadGuestLocalPrefs,
  saveGuestLocalPrefs,
} from "@/lib/guest-local-prefs";

function Stars({ value }: { value: number }) {
  const full = Math.round(Math.max(0, Math.min(5, value)));
  return (
    <span className="venue-stars" aria-label={`${value.toFixed(1)} / 5`}>
      {"★★★★★".slice(0, full)}
      <span>{"★★★★★".slice(full)}</span>
    </span>
  );
}

function FavoriteControl({
  favorited,
  href,
  label,
  onClick,
  className = "",
  iconOnly = false,
}: {
  favorited: boolean;
  href?: string;
  label: string;
  onClick?: () => void;
  className?: string;
  iconOnly?: boolean;
}) {
  const content = (
    <>
      <span className="venue-fav-icon" aria-hidden>
        {favorited ? "♥" : "♡"}
      </span>
      {!iconOnly && <span className="venue-fav-label">{label}</span>}
    </>
  );

  if (href) {
    return (
      <Link className={className} href={href} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={favorited}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {content}
    </button>
  );
}

export default function VenuePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;
  const router = useRouter();
  const { locale, t } = useLocale();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [places, setPlaces] = useState<VenuePlaces | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [comingOpen, setComingOpen] = useState(false);
  const [notifySetIds, setNotifySetIds] = useState<Set<string>>(() => new Set());
  const [comingArrivalById, setComingArrivalById] = useState<
    Record<string, string>
  >({});
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
    });
    Promise.all([
      fetchVenue(venueId),
      fetchTables(venueId),
      fetchVenuePlaces(venueId),
    ])
      .then(([v, tableList, p]) => {
        if (!active) return;
        setVenue(v);
        setTables(tableList);
        setPlaces(p);
        setPhotoIdx(0);
      })
      .catch(() => {
        if (active) setError("not_found");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [venueId]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!getToken()) {
        if (alive) {
          setUser(null);
          setFavorited(false);
        }
        return;
      }
      fetchMe()
        .then((u) => {
          if (!alive) return;
          setUser(u);
          const prefs = loadGuestLocalPrefs(u.id);
          setFavorited(prefs.favorites.some((f) => f.venueId === venueId));
        })
        .catch(() => {
          if (alive) {
            setUser(null);
            setFavorited(false);
          }
        });
    });
    return () => {
      alive = false;
    };
  }, [venueId]);

  const photos = useMemo(() => {
    const fromPlaces = places?.photo_urls ?? [];
    if (fromPlaces.length) return fromPlaces;
    if (venue?.photo_urls?.length) return venue.photo_urls;
    if (venue?.image_url) return [venue.image_url];
    return [];
  }, [places, venue]);

  const reviews = places?.reviews?.length ? places.reviews : venue?.reviews ?? [];
  const rating = places?.rating || venue?.rating || 0;
  const reviewCount = places?.review_count || venue?.review_count || reviews.length;
  const freeCount = tables.filter((table) => table.status === "FREE").length;
  const zones = listZonesFromTables(tables);

  function addToFavorites() {
    if (!user || !venue) return;
    const prefs = loadGuestLocalPrefs(user.id);
    const next = addFavoriteVenue(prefs, {
      venueId: venue.id,
      name: pickLocale(venue.name, locale),
    });
    saveGuestLocalPrefs(user.id, next);
    setFavorited(true);
  }

  function scrollToFloor() {
    document.getElementById("venue-floor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openBooking(table: Table) {
    if (table.status !== "FREE") return;
    setSelectedTable(table);
    setBookingOpen(true);
    setComingOpen(false);
    setSheetMessage(null);
  }

  async function handleNotifyFree(table: Table) {
    setSheetMessage(null);
    if (!getToken()) {
      setSheetMessage(t("table.login_needed"));
      router.push(`/login?next=${encodeURIComponent(`/venues/${venueId}`)}`);
      return;
    }
    try {
      await watchTable({ venue_id: venueId, table_id: table.id });
    } catch {
      /* demo still shows confirmation like the prototype */
    }
    setNotifySetIds((prev) => new Set(prev).add(table.id));
    setSheetMessage(t("table.notify_set"));
  }

  function openComing(table: Table) {
    if (table.status !== "RESERVED") return;
    setSelectedTable(table);
    setComingOpen(true);
    setBookingOpen(false);
    setSheetMessage(null);
  }

  async function refreshTables() {
    try {
      const next = await fetchTables(venueId);
      setTables(next);
    } catch {
      /* keep current tables */
    }
  }

  if (loading) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <p className="venue-page-loading">{t("venue.loading")}</p>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <div className="venue-page-empty">
          <h1>{error === "not_found" ? t("venue.not_found") : error || t("venue.not_found")}</h1>
          <Link href="/">{t("venue.back_map")}</Link>
        </div>
      </div>
    );
  }

  const loginNext = `/login?next=${encodeURIComponent(`/venues/${venue.id}`)}`;
  const favoriteLabel = favorited
    ? t("profile.favorites_added")
    : t("profile.favorites_add");
  const favoriteHref = user ? undefined : loginNext;

  return (
    <div className="venue-page">
      <SiteHeader variant="solid" />
      <div className="venue-page-wrap">
        <nav className="venue-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">← {t("nav.map")}</Link>
          <span aria-hidden>/</span>
          <span>{pickLocale(venue.name, locale)}</span>
        </nav>

        <div className="venue-hero">
          <div className="venue-hero-media">
            <div className="venue-hero-frame">
              {photos[photoIdx] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(photos[photoIdx])}
                  alt={pickLocale(venue.name, locale)}
                />
              ) : (
                <div className="venue-hero-fallback" />
              )}

              <div className="venue-hero-overlays">
                <span className={`venue-status-badge ${venue.open_now ? "open" : "closed"}`}>
                  {venue.open_now ? t("venue.open") : t("venue.closed")}
                </span>
                <FavoriteControl
                  className={`venue-fav-float${favorited ? " on" : ""}`}
                  favorited={favorited}
                  href={favoriteHref}
                  label={favoriteLabel}
                  onClick={user ? addToFavorites : undefined}
                  iconOnly
                />
              </div>

              <div className="venue-free-float">
                <b>{freeCount}</b>
                <span>{t("venue.free_tables")}</span>
              </div>
            </div>

            {photos.length > 1 && (
              <div className="venue-hero-thumbs">
                {photos.slice(0, 6).map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className={index === photoIdx ? "on" : ""}
                    onClick={() => setPhotoIdx(index)}
                    aria-label={`Photo ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(url)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="venue-hero-copy">
            <p className="venue-page-kicker">
              {places?.live_google ? t("venue.photos_live") : t("venue.photos_style")}
            </p>
            <h1>{pickLocale(venue.name, locale)}</h1>
            <p className="venue-page-address">⌖ {pickLocale(venue.address, locale)}</p>

            <div className="venue-rating-row">
              <Stars value={rating} />
              <strong>{rating.toFixed(1)}</strong>
              <span>{t("venue.reviews_count", { count: reviewCount })}</span>
            </div>

            <p className="venue-page-desc">{pickLocale(venue.description, locale)}</p>

            <div className="venue-page-meta">
              {venue.cuisine.slice(0, 3).map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span>{priceLevelLabel(venue.price_level)}</span>
              <span>~{venue.average_check} MDL</span>
            </div>

            <div className="venue-page-actions">
              <button
                type="button"
                className="venue-cta venue-cta-primary"
                onClick={scrollToFloor}
              >
                {t("venue.book_scroll")} <span aria-hidden>↓</span>
              </button>

              <div className="venue-page-actions-secondary">
                <Link className="venue-cta ghost" href={`/venues/${venue.id}/menu`}>
                  {t("venue.menu")}
                </Link>
                <FavoriteControl
                  className={`venue-cta ghost venue-cta-fav${favorited ? " on" : ""}`}
                  favorited={favorited}
                  href={favoriteHref}
                  label={favoriteLabel}
                  onClick={user ? addToFavorites : undefined}
                />
                <Link className="venue-cta ghost" href="/">
                  {t("venue.back_map")}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <section id="venue-floor" className="venue-section venue-section-floor">
          <div className="venue-section-head">
            <div>
              <h2>{t("venue.choose_table")}</h2>
              <p>{t("floor.pick_hint")}</p>
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
              <span>
                <i className="cleaning" /> {t("floor.leg_clean")}
              </span>
            </div>
          </div>
          <div className="venue-floor-stage">
            <TableFloorPlan
              tables={tables}
              selectedId={selectedTable?.id}
              hideSheet
              onTableClick={(table) => {
                setSelectedTable(table);
                setSheetMessage(null);
              }}
              onReserve={openBooking}
              onNotifyFree={(table) => void handleNotifyFree(table)}
              onImComing={openComing}
              notifySetIds={notifySetIds}
              comingArrivalById={comingArrivalById}
              sheetMessage={sheetMessage}
            />
          </div>

          <div className="venue-floor-panels">
            <div className="venue-floor-panel reserve">
              {selectedTable ? (
                <TableReserveSheet
                  table={selectedTable}
                  className="beside"
                  onReserve={openBooking}
                  onNotifyFree={(table) => void handleNotifyFree(table)}
                  onImComing={openComing}
                  notifyDone={notifySetIds.has(selectedTable.id)}
                  comingDone={Boolean(comingArrivalById[selectedTable.id])}
                  comingTimeLabel={
                    comingArrivalById[selectedTable.id]
                      ? new Date(
                          comingArrivalById[selectedTable.id],
                        ).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : undefined
                  }
                  sheetMessage={sheetMessage}
                />
              ) : (
                <p className="venue-floor-panel-empty">
                  {t("venue.day_cal_pick_table")}
                </p>
              )}
            </div>
            <div className="venue-floor-panel schedule">
              <VenueDayCalendar
                venueId={venue.id}
                tables={tables}
                focusTableId={selectedTable?.id ?? null}
                compact
                staffEnabled={
                  user?.role === "restaurant" || user?.role === "admin"
                }
                isAdmin={user?.role === "admin"}
              />
            </div>
          </div>

          {selectedTable && (
            <BookingPopup
              venue={venue}
              table={selectedTable}
              open={bookingOpen}
              onClose={() => setBookingOpen(false)}
              onBooked={() => void refreshTables()}
            />
          )}

          {selectedTable && (
            <ComingPopup
              table={selectedTable}
              open={comingOpen}
              loginNext={`/venues/${venueId}`}
              onClose={() => setComingOpen(false)}
              onConfirmed={(arrivalIso) => {
                setComingArrivalById((prev) => ({
                  ...prev,
                  [selectedTable.id]: arrivalIso,
                }));
                const time = new Date(arrivalIso).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                setSheetMessage(t("table.im_coming_set", { time }));
              }}
            />
          )}

          <WaitlistPanel venueId={venue.id} zones={zones} />
        </section>

        <section className="venue-section venue-section-reviews">
          <div className="venue-section-head">
            <div>
              <h2>{t("venue.reviews_title")}</h2>
              <p>
                {places?.source === "google"
                  ? t("venue.reviews_google")
                  : t("venue.reviews_sample")}
              </p>
            </div>
          </div>
          <div className="venue-reviews">
            {reviews.map((review, index) => (
              <article key={`${review.author}-${index}`}>
                <header>
                  <div>
                    <strong>{review.author}</strong>
                    {review.relative_time && <small>{review.relative_time}</small>}
                  </div>
                  <Stars value={review.rating} />
                </header>
                <p>{review.text}</p>
                {review.source === "google" && (
                  <span className="venue-review-source">Google</span>
                )}
              </article>
            ))}
            {reviews.length === 0 && (
              <p className="venue-page-empty-inline">{t("venue.reviews_empty")}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
