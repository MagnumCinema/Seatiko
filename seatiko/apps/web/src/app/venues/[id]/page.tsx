"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TableFloorPlan, TableReserveSheet, isMyTable } from "@/components/table-floor-plan";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { BookingPopup } from "@/components/booking-popup";
import { EventPopup } from "@/components/event-popup";
import { VENUE_LOCATION_ANCHOR, VenueLocationMap } from "@/components/venue-location-map";
import { parseBookingParams } from "@/lib/booking-link";
import { ComingPopup } from "@/components/coming-popup";
import { VenueBookingRules } from "@/components/venue-booking-rules";
import { resolveBookingRules } from "@/lib/venue-rules";
import { AuthDialog } from "@/components/auth-dialog";
import { PhotoCarousel } from "@/components/photo-carousel";
import {
  BoltIcon,
  CelebrationIcon,
  HeartIcon,
  MapPinIcon,
  MenuBookIcon,
  TableIcon,
} from "@/components/venue-icons";
import { VenueDayCalendar } from "@/components/venue-day-calendar";
import { useLocale } from "@/components/locale-provider";
import { listZonesFromTables } from "@/lib/floor-zones";
import { getSiteCopy } from "@/lib/site-copy";
import { apiErrorKey } from "@/lib/api-error-message";
import { parseOpeningHours } from "@/lib/booking-slots";
import { getVenueHours } from "@/lib/venue-hours";
import { AUTH_CHANGE_EVENT } from "@/lib/header-auth";
import {
  fetchMe,
  fetchReservations,
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

const TABLES_POLL_MS = 30_000;

type PendingAuth = { reason: string; then?: (user: User) => void };

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
        <HeartIcon filled={favorited} />
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
  const searchParams = useSearchParams();
  const [deepLink] = useState(() => parseBookingParams(searchParams));
  const { locale, t } = useLocale();
  const cuisineLabels: Record<string, string> = getSiteCopy(locale).catalog.cuisines;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [places, setPlaces] = useState<VenuePlaces | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [myReservationIds, setMyReservationIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [favorited, setFavorited] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const [bookingOpen, setBookingOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(deepLink.intent === "quick");
  const [eventOpen, setEventOpen] = useState(deepLink.intent === "event");
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

  function applyUser(u: User | null) {
    setUser(u);
    setFavorited(
      u ? loadGuestLocalPrefs(u.id).favorites.some((f) => f.venueId === venueId) : false,
    );
    if (!u) {
      setMyReservationIds(new Set());
      return;
    }
    refreshMyReservations();
  }

  function refreshMyReservations() {
    fetchReservations()
      .then((list) =>
        setMyReservationIds(
          new Set(list.filter((r) => r.status !== "CANCELLED").map((r) => r.id)),
        ),
      )
      .catch(() => setMyReservationIds(new Set()));
  }

  useEffect(() => {
    let alive = true;
    const sync = () => {
      const resolveUser = getToken() ? fetchMe().catch(() => null) : Promise.resolve(null);
      void resolveUser.then((u) => {
        if (alive) applyUser(u);
      });
    };
    sync();
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyUser only reads venueId
  }, [venueId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchTables(venueId)
        .then(setTables)
        .catch(() => {
          /* keep the last known floor state */
        });
    }, TABLES_POLL_MS);
    return () => window.clearInterval(timer);
  }, [venueId]);

  function requireAuth(reason: string, then?: (user: User) => void) {
    setPendingAuth({ reason, then });
  }

  async function handleAuthSuccess() {
    const action = pendingAuth?.then;
    setPendingAuth(null);
    const u = await fetchMe().catch(() => null);
    applyUser(u);
    if (u && action) action(u);
  }

  const photos = useMemo(() => {
    const fromPlaces = places?.photo_urls ?? [];
    if (fromPlaces.length) return fromPlaces;
    if (venue?.photo_urls?.length) return venue.photo_urls;
    if (venue?.image_url) return [venue.image_url];
    return [];
  }, [places, venue]);

  const openingHours = useMemo(
    () => parseOpeningHours(getVenueHours(venueId, "ru")),
    [venueId],
  );
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);

  const reviews = places?.reviews?.length ? places.reviews : venue?.reviews ?? [];
  const rating = places?.rating || venue?.rating || 0;
  const reviewCount = places?.review_count || venue?.review_count || reviews.length;
  const freeCount = tables.filter((table) => table.status === "FREE").length;
  const zones = listZonesFromTables(tables);

  function addToFavorites(forUser: User | null = user) {
    if (!venue) return;
    if (!forUser) {
      requireAuth(t("auth.reason_favorite"), (u) => addToFavorites(u));
      return;
    }
    const prefs = loadGuestLocalPrefs(forUser.id);
    const next = addFavoriteVenue(prefs, {
      venueId: venue.id,
      name: pickLocale(venue.name, locale),
    });
    saveGuestLocalPrefs(forUser.id, next);
    setFavorited(true);
  }

  function scrollToFloor() {
    document.getElementById("venue-floor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openBooking(table: Table) {
    setSelectedTableId(table.id);
    setBookingOpen(true);
    setComingOpen(false);
    setSheetMessage(null);
  }

  async function handleNotifyFree(table: Table) {
    setSheetMessage(null);
    if (!getToken()) {
      requireAuth(t("auth.reason_notify"), () => void handleNotifyFree(table));
      return;
    }
    try {
      await watchTable({ venue_id: venueId, table_id: table.id });
      setNotifySetIds((prev) => new Set(prev).add(table.id));
      setSheetMessage(t("table.notify_set"));
    } catch (e) {
      setSheetMessage(t(apiErrorKey(e)));
    }
  }

  function openComing(table: Table) {
    if (table.status !== "RESERVED") return;
    setSelectedTableId(table.id);
    setComingOpen(true);
    setBookingOpen(false);
    setSheetMessage(null);
  }

  function comingAccessFor(table: Table): "allowed" | "sign_in" | "hidden" {
    if (!user) return "sign_in";
    return table.reservation_id && myReservationIds.has(table.reservation_id)
      ? "allowed"
      : "hidden";
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

  const favoriteLabel = favorited
    ? t("profile.favorites_added")
    : t("profile.favorites_add");
  const bookingRules = resolveBookingRules(venue);
  const sessionStartBeforeMin = bookingRules.session_start_before_min;
  const releaseBeforeMin = bookingRules.release_before_min;

  return (
    <div className="venue-page">
      <SiteHeader variant="solid" />
      <div className="venue-page-wrap">
        <nav className="venue-breadcrumb" aria-label={t("nav.breadcrumb")}>
          <Link href="/">← {t("nav.map")}</Link>
          <span aria-hidden>/</span>
          <span>{pickLocale(venue.name, locale)}</span>
        </nav>

        <div className="venue-hero">
          <div className="venue-hero-media">
            <PhotoCarousel
              key={venue.id}
              photos={photos.slice(0, 8).map((url) => mediaUrl(url))}
              alt={pickLocale(venue.name, locale)}
              overlay={
                <>
                  <div className="venue-hero-overlays">
                    <span className={`venue-status-badge ${venue.open_now ? "open" : "closed"}`}>
                      {venue.open_now ? t("venue.open") : t("venue.closed")}
                    </span>
                    <FavoriteControl
                      className={`venue-fav-float${favorited ? " on" : ""}`}
                      favorited={favorited}
                      label={favoriteLabel}
                      onClick={() => addToFavorites()}
                      iconOnly
                    />
                  </div>
                  <div className="venue-free-float">
                    <b>{freeCount}</b>
                    <span>{t("venue.free_tables")}</span>
                  </div>
                </>
              }
            />
          </div>

          <div className="venue-hero-copy">
            <p className="venue-page-kicker">
              {[
                venue.cuisine[0] ? (cuisineLabels[venue.cuisine[0]] ?? venue.cuisine[0]) : null,
                t("map.title"),
              ]
                .filter(Boolean)
                .join(" · ")}
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
                <span key={item}>{cuisineLabels[item] ?? item}</span>
              ))}
              <span>{priceLevelLabel(venue.price_level)}</span>
              <span>~{venue.average_check} MDL</span>
            </div>

            <div className="venue-page-actions">
              <div className="venue-page-actions-primary">
                <button
                  type="button"
                  className="venue-cta venue-cta-hero"
                  onClick={() => {
                    setBookingOpen(false);
                    setComingOpen(false);
                    setQuickOpen(true);
                  }}
                >
                  <BoltIcon className="venue-cta-icon" />
                  <span>{t("venue.quick_book")}</span>
                </button>
                <button
                  type="button"
                  className="venue-cta venue-cta-outline"
                  onClick={scrollToFloor}
                >
                  <TableIcon className="venue-cta-icon" />
                  <span>{t("venue.book_scroll")}</span>
                </button>
              </div>

              <div className="venue-page-actions-secondary">
                <Link className="venue-tile" href={`/venues/${venue.id}/menu`}>
                  <span className="venue-tile-icon">
                    <MenuBookIcon />
                  </span>
                  <span className="venue-tile-text">
                    <span className="venue-tile-name">{t("venue.menu")}</span>
                    <span className="venue-tile-desc">{t("venue.menu_sub")}</span>
                  </span>
                </Link>
                <a
                  className="venue-tile"
                  href={`#${VENUE_LOCATION_ANCHOR}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document
                      .getElementById(VENUE_LOCATION_ANCHOR)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span className="venue-tile-icon">
                    <MapPinIcon />
                  </span>
                  <span className="venue-tile-text">
                    <span className="venue-tile-name">{t("venue.location_tile")}</span>
                    <span className="venue-tile-desc">{pickLocale(venue.address, locale)}</span>
                  </span>
                </a>
                <button
                  type="button"
                  className="venue-tile"
                  onClick={() => {
                    setQuickOpen(false);
                    setBookingOpen(false);
                    setEventOpen(true);
                  }}
                >
                  <span className="venue-tile-icon">
                    <CelebrationIcon />
                  </span>
                  <span className="venue-tile-text">
                    <span className="venue-tile-name">{t("venue.event_tile")}</span>
                    <span className="venue-tile-desc">{t("venue.event_tile_sub")}</span>
                  </span>
                </button>
                <FavoriteControl
                  className={`venue-cta ghost venue-cta-fav${favorited ? " on" : ""}`}
                  favorited={favorited}
                  label={favoriteLabel}
                  onClick={() => addToFavorites()}
                />
              </div>
            </div>
          </div>
        </div>

        <VenueBookingRules rules={bookingRules} allowPreorder={venue.allow_preorder !== false} />

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
              {user ? (
                <span>
                  <i className="mine" /> {t("floor.leg_mine")}
                </span>
              ) : null}
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
                setSelectedTableId(table.id);
                setSheetMessage(null);
              }}
              onReserve={openBooking}
              onNotifyFree={(table) => void handleNotifyFree(table)}
              onImComing={openComing}
              notifySetIds={notifySetIds}
              comingArrivalById={comingArrivalById}
              sheetMessage={sheetMessage}
              mineReservationIds={myReservationIds}
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
                  comingAccess={comingAccessFor(selectedTable)}
                  onComingSignIn={() => requireAuth(t("auth.reason_coming"))}
                  sessionStartBeforeMin={sessionStartBeforeMin}
                  releaseBeforeMin={releaseBeforeMin}
                  mine={isMyTable(selectedTable, myReservationIds)}
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
                openingHours={openingHours}
                reloadKey={scheduleReloadKey}
                mineReservationIds={myReservationIds}
              />
            </div>
          </div>

          <BookingPopup
            venue={venue}
            table={null}
            tables={tables}
            open={quickOpen}
            onClose={() => setQuickOpen(false)}
            initialGuests={deepLink.guests}
            initialTime={deepLink.time}
            initialDurationMin={deepLink.durationMin}
            onBooked={() => {
              void refreshTables();
              refreshMyReservations();
              setScheduleReloadKey((key) => key + 1);
            }}
          />

          {selectedTable && (
            <BookingPopup
              venue={venue}
              table={selectedTable}
              open={bookingOpen}
              onClose={() => setBookingOpen(false)}
              onBooked={() => {
                void refreshTables();
                refreshMyReservations();
                setScheduleReloadKey((key) => key + 1);
              }}
            />
          )}

          {selectedTable && (
            <ComingPopup
              table={selectedTable}
              open={comingOpen}
              sessionStartBeforeMin={sessionStartBeforeMin}
              releaseBeforeMin={releaseBeforeMin}
              maxLateArrivalMin={bookingRules.max_late_arrival_min}
              onAuthRequired={() => {
                setComingOpen(false);
                requireAuth(t("auth.reason_coming"));
              }}
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

          <WaitlistPanel
            venueId={venue.id}
            zones={zones}
            onAuthRequired={() => requireAuth(t("auth.reason_waitlist"))}
          />
        </section>

        <VenueLocationMap venue={venue} />

        <EventPopup
          venue={venue}
          open={eventOpen}
          onClose={() => setEventOpen(false)}
          onAuthRequired={() => requireAuth(t("auth.reason_event"))}
        />

        <AuthDialog
          open={pendingAuth !== null}
          reason={pendingAuth?.reason}
          onClose={() => setPendingAuth(null)}
          onSuccess={() => void handleAuthSuccess()}
        />

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
                  <span className="venue-review-avatar" aria-hidden>
                    {review.author.trim().charAt(0).toUpperCase() || "·"}
                  </span>
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
