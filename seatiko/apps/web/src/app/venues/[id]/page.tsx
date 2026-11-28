"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button, ButtonLink, IconButton, buttonClassName } from "@/components/ui/button";
import { useCurrency } from "@/components/currency-provider";
import { TableFloorPlan, isMyTable } from "@/components/table-floor-plan";
import { TableInspector } from "@/components/table-inspector";
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
  ShareIcon,
  TableIcon,
} from "@/components/venue-icons";
import { useVenueSchedule } from "@/components/venue-day-calendar";
import { ScrollerFade } from "@/components/ui/scroller-fade";
import { useToast } from "@/components/ui/toast-provider";
import { defaultTable } from "@/lib/floor-picks";
import { useLocale } from "@/components/locale-provider";
import { listZonesFromTables } from "@/lib/floor-zones";
import { getSiteCopy } from "@/lib/site-copy";
import { apiErrorKey } from "@/lib/api-error-message";
import { venueHoursOn } from "@/lib/venue-hours";
import { AUTH_CHANGE_EVENT } from "@/lib/header-auth";
import { formatBudgetAmount } from "@/lib/discover-preferences";
import {
  isVenueBookable,
  reviewTimeLabel,
  reviewsForLocale,
  toggleFavoriteId,
} from "@/lib/venue-page";
import {
  ApiError,
  fetchMe,
  fetchReservations,
  fetchTables,
  fetchVenue,
  fetchVenuePlaces,
  getToken,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  updateMe,
  watchTable,
  type Table,
  type User,
  type Venue,
  type VenuePlaces,
} from "@/lib/api";
import {
  addFavoriteVenue,
  loadGuestLocalPrefs,
  removeFavoriteVenue,
  saveGuestLocalPrefs,
} from "@/lib/guest-local-prefs";

const TABLES_POLL_MS = 30_000;
/** Favorites of a guest who is not signed in (same storage as the /venues catalog). */
const GUEST_FAVORITES_ID = "guest-local";

type LoadError = "not_found" | "load_failed";

/** Did the guest reach this page by navigating inside the site (so "Back" can return there)? */
function cameFromInsideSite(): boolean {
  if (typeof window === "undefined" || window.history.length < 2) return false;
  const entry = performance.getEntriesByType?.("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!entry) return false;
  try {
    return new URL(entry.name).pathname !== window.location.pathname;
  } catch {
    return false;
  }
}

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

export default function VenuePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;
  const searchParams = useSearchParams();
  const [deepLink] = useState(() => parseBookingParams(searchParams));
  const router = useRouter();
  const { locale, t } = useLocale();
  const { currency } = useCurrency();
  const siteCopy = getSiteCopy(locale);
  const cuisineLabels: Record<string, string> = siteCopy.catalog.cuisines;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [places, setPlaces] = useState<VenuePlaces | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [myReservationIds, setMyReservationIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [favoriteIds, setFavoriteIds] = useState<readonly string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const favorited = favoriteIds.includes(venueId);
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
  /** Start picked on the table's timeline; the table popup opens on it. */
  const [bookingStartIso, setBookingStartIso] = useState<string | null>(null);
  const toast = useToast();

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
      // Photos and reviews are extras: the page works without them.
      fetchVenuePlaces(venueId).catch(() => null),
    ])
      .then(([v, tableList, p]) => {
        if (!active) return;
        setVenue(v);
        setTables(tableList);
        setPlaces(p);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof ApiError && e.status === 404 ? "not_found" : "load_failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [venueId, reloadKey]);

  function applyUser(u: User | null) {
    setUser(u);
    // Signed in: favorites live on the account (PATCH /me); otherwise in this browser only.
    setFavoriteIds(
      u
        ? (u.favorite_venues ?? [])
        : loadGuestLocalPrefs(GUEST_FAVORITES_ID).favorites.map((f) => f.venueId),
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

  const pageReady = !loading && venue !== null;
  useEffect(() => {
    if (!pageReady) return;
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (!target) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [pageReady]);

  function requireAuth(reason: string, then?: (user: User) => void) {
    setPendingAuth({ reason, then });
  }

  async function handleAuthSuccess() {
    const action = pendingAuth?.then;
    setPendingAuth(null);
    const u = await fetchMe().catch(() => null);
    applyUser(u);
    // Sync SiteHeader's cached user so it shows the logged-in name immediately.
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    if (u && action) action(u);
  }

  const photos = useMemo(() => {
    const fromPlaces = places?.photo_urls ?? [];
    if (fromPlaces.length) return fromPlaces;
    if (venue?.photo_urls?.length) return venue.photo_urls;
    if (venue?.image_url) return [venue.image_url];
    return [];
  }, [places, venue]);

  const venueHoursText = venue?.hours_text;
  // The schedule grid follows the venue's own hours on the day it shows (days off, after midnight).
  const hoursOn = useMemo(
    () => (day: Date) => venueHoursOn({ id: venueId, hours_text: venueHoursText }, day),
    [venueId, venueHoursText],
  );
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);
  const schedule = useVenueSchedule({
    venueId,
    staffEnabled: user?.role === "restaurant" || user?.role === "admin",
    isAdmin: user?.role === "admin",
    reloadKey: scheduleReloadKey,
  });

  const reviews = places?.reviews?.length ? places.reviews : venue?.reviews ?? [];
  const rating = places?.rating || venue?.rating || 0;
  const reviewCount = places?.review_count || venue?.review_count || reviews.length;
  const freeCount = tables.filter((table) => table.status === "FREE").length;
  const zones = listZonesFromTables(tables);
  // A table is always selected, so the inspector opens on its day instead of an empty panel.
  const shownTable = selectedTable ?? defaultTable(tables, zones);

  /** Keep a browser favorites list in step with the heart on this page. */
  function syncLocalFavorite(storageId: string, adding: boolean) {
    if (!venue) return;
    const prefs = loadGuestLocalPrefs(storageId);
    saveGuestLocalPrefs(
      storageId,
      adding
        ? addFavoriteVenue(prefs, { venueId: venue.id, name: pickLocale(venue.name, locale) })
        : removeFavoriteVenue(prefs, venue.id),
    );
  }

  async function toggleFavorite(undo = false) {
    if (!venue || favoriteBusy) return;
    const previous = favoriteIds;
    const next = toggleFavoriteId(previous, venue.id);
    const adding = next.length > previous.length;
    setFavoriteIds(next);
    const announce = () => {
      if (undo) return;
      toast.show(
        adding
          ? { message: t("hero.fav_added"), tone: "success", duration: 2500 }
          : { message: t("hero.fav_removed"), actionLabel: t("booking.undo"), onAction: () => void toggleFavorite(true) },
      );
    };
    if (!user) {
      syncLocalFavorite(GUEST_FAVORITES_ID, adding);
      announce();
      return;
    }
    setFavoriteBusy(true);
    try {
      const updated = await updateMe({ favorite_venues: next });
      setUser(updated);
      setFavoriteIds(updated.favorite_venues ?? next);
      // /account shows its cached list (with names) first, so keep it in step.
      syncLocalFavorite(updated.id, adding);
      announce();
    } catch {
      setFavoriteIds(previous);
      toast.show({ message: t("hero.fav_failed"), tone: "error" });
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function shareVenue() {
    if (!venue) return;
    const url = `${window.location.origin}/venues/${encodeURIComponent(venue.id)}`;
    const title = pickLocale(venue.name, locale);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.show({ message: t("hero.share_copied"), tone: "success", duration: 2500 });
    } catch {
      /* the guest closed the share sheet */
    }
  }

  function scrollToFloor() {
    document.getElementById("venue-floor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openBooking(table: Table, startIso: string | null = null) {
    setSelectedTableId(table.id);
    setBookingStartIso(startIso);
    setBookingOpen(true);
    setComingOpen(false);
    setEventOpen(false);
    setQuickOpen(false);
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
    setEventOpen(false);
    setQuickOpen(false);
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
        <div className="venue-page-wrap">
          <nav className="venue-breadcrumb" aria-label={t("nav.breadcrumb")}>
            <span className="skeleton skeleton-text" style={{ width: 80 }} />
            <span aria-hidden>/</span>
            <span className="skeleton skeleton-text" style={{ width: 120 }} />
          </nav>

          <div className="venue-hero">
            <div className="venue-hero-media">
              <span className="skeleton skeleton-media" style={{ height: 340 }} />
            </div>
            <div className="venue-hero-copy">
              <span className="skeleton skeleton-text" style={{ width: 60 }} />
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-text" style={{ width: "55%" }} />

              <div className="venue-rating-row">
                <span className="skeleton skeleton-text" style={{ width: 90 }} />
                <span className="skeleton skeleton-text" style={{ width: 40 }} />
                <span className="skeleton skeleton-text" style={{ width: 70 }} />
              </div>

              <span className="skeleton skeleton-text" style={{ width: "100%" }} />
              <span className="skeleton skeleton-text" style={{ width: "90%" }} />
              <span className="skeleton skeleton-text" style={{ width: "75%" }} />

              <div className="venue-page-meta">
                <span className="skeleton skeleton-chip" />
                <span className="skeleton skeleton-chip" />
                <span className="skeleton skeleton-chip" />
              </div>

              <div className="venue-page-actions-primary">
                <span className="skeleton skeleton-btn" />
                <span className="skeleton skeleton-btn" />
              </div>
            </div>
          </div>

          <div className="venue-booking-rules-skeleton">
            <div className="venue-booking-rules-card">
              <span className="skeleton skeleton-text" style={{ width: 120 }} />
              <div className="venue-booking-rules-times">
                <span className="skeleton skeleton-text" style={{ width: 80 }} />
                <span className="skeleton skeleton-text" style={{ width: 100 }} />
                <span className="skeleton skeleton-text" style={{ width: 90 }} />
              </div>
            </div>
          </div>

          <section className="venue-section">
            <div className="venue-section-head">
              <span className="skeleton skeleton-title" style={{ width: 180 }} />
              <span className="skeleton skeleton-text" style={{ width: 120 }} />
            </div>
            <span className="skeleton skeleton-media" style={{ height: 200 }} />
          </section>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (error || !venue) {
    const notFound = error !== "load_failed";
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <main className="venue-page-empty venue-empty-state">
          <span className={`venue-empty-icon${notFound ? "" : " is-error"}`} aria-hidden>
            {notFound ? <MapPinIcon /> : "!"}
          </span>
          <h1>{notFound ? t("venue.not_found") : t("venue.load_error_title")}</h1>
          <p>{notFound ? t("venue.not_found_body") : t("venue.load_error_body")}</p>
          <div className="venue-empty-actions">
            {notFound ? (
              <>
                <ButtonLink href="/venues" size="lg">
                  {t("venue.to_catalog")}
                </ButtonLink>
                <ButtonLink href="/#map" variant="secondary" size="lg">
                  {t("venue.to_map")}
                </ButtonLink>
              </>
            ) : (
              <>
                <Button size="lg" onClick={() => setReloadKey((key) => key + 1)}>
                  {t("venue.retry")}
                </Button>
                <ButtonLink href="/venues" variant="secondary" size="lg">
                  {t("venue.to_catalog")}
                </ButtonLink>
              </>
            )}
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const favoriteLabel = favorited ? t("venue.fav_remove") : t("profile.favorites_add");
  const bookable = isVenueBookable(venue, tables);
  const visibleReviews = reviewsForLocale(reviews, locale);
  const venuePhone = venue.phone?.trim();
  const venueWebsite = venue.website?.trim();
  const bookingRules = resolveBookingRules(venue);
  const sessionStartBeforeMin = bookingRules.session_start_before_min;
  const releaseBeforeMin = bookingRules.release_before_min;

  return (
    <div className="venue-page">
      <SiteHeader variant="solid" />
      <div className="venue-page-wrap">
        <nav className="venue-breadcrumb" aria-label={t("nav.breadcrumb")}>
          <Link
            href="/venues"
            onClick={(event) => {
              // Back to the page the guest came from (catalog, map, search…); a direct visit goes to the catalog.
              if (!cameFromInsideSite()) return;
              event.preventDefault();
              router.back();
            }}
          >
            ← {t("venue.back")}
          </Link>
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
                  </div>
                  {bookable ? (
                    <div className="venue-free-float">
                      <b>{freeCount}</b>
                      <span>{t("venue.free_tables")}</span>
                    </div>
                  ) : (
                    <div className="venue-free-float is-soon">
                      <span>{t("venue.booking_soon_badge")}</span>
                    </div>
                  )}
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
              <span>
                ~{formatBudgetAmount(venue.average_check, currency)}{" "}
                {siteCopy.discover.budgetCurrencies[currency]}
              </span>
            </div>

          </div>
        </div>

        {/* One aligned action row under the hero: [Quick] [Hall] [♡] [Share] + three equal tiles. */}
        <div className="venue-page-actions">
          {bookable ? (
            <div className="venue-action-bar">
              <Button
                size="lg"
                className="venue-action-main"
                leftIcon={<BoltIcon />}
                onClick={() => {
                  setQuickOpen(true);
                  setBookingOpen(false);
                  setComingOpen(false);
                  setEventOpen(false);
                }}
              >
                <span>{t("venue.quick_book")}</span>
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="venue-action-main"
                leftIcon={<TableIcon />}
                onClick={scrollToFloor}
              >
                <span>{t("venue.book_scroll")}</span>
              </Button>
              <IconButton
                variant="secondary"
                size="lg"
                className={`venue-action-icon venue-fav-btn${favorited ? " is-on" : ""}`}
                label={favoriteLabel}
                aria-pressed={favorited}
                icon={<HeartIcon filled={favorited} />}
                onClick={() => void toggleFavorite()}
              />
              <IconButton
                variant="secondary"
                size="lg"
                className="venue-action-icon"
                label={t("hero.share")}
                icon={<ShareIcon />}
                onClick={() => void shareVenue()}
              />
            </div>
          ) : (
            <>
              <div className="venue-booking-soon" role="status">
                <strong>{t("venue.booking_soon_title")}</strong>
                <p>
                  {venuePhone || venueWebsite
                    ? t("venue.booking_soon_body")
                    : t("venue.booking_soon_no_contacts")}
                </p>
                <div className="venue-booking-soon-actions">
                  {venuePhone ? (
                    <a
                      className={buttonClassName({ size: "md" })}
                      href={`tel:${venuePhone.replace(/[^\d+]/g, "")}`}
                    >
                      <span className="btn-content">
                        {t("venue.call")} {venuePhone}
                      </span>
                    </a>
                  ) : null}
                  {venueWebsite ? (
                    <a
                      className={buttonClassName({
                        variant: venuePhone ? "secondary" : "primary",
                        size: "md",
                      })}
                      href={venueWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="btn-content">{t("venue.website")}</span>
                    </a>
                  ) : null}
                  {!venuePhone && !venueWebsite ? (
                    <Button
                      variant="secondary"
                      size="md"
                      leftIcon={<MapPinIcon />}
                      onClick={() =>
                        document
                          .getElementById(VENUE_LOCATION_ANCHOR)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                    >
                      <span>{t("venue.route")}</span>
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="venue-action-bar is-icons">
              <IconButton
                variant="secondary"
                size="lg"
                className={`venue-action-icon venue-fav-btn${favorited ? " is-on" : ""}`}
                label={favoriteLabel}
                aria-pressed={favorited}
                icon={<HeartIcon filled={favorited} />}
                onClick={() => void toggleFavorite()}
              />
              <IconButton
                variant="secondary"
                size="lg"
                className="venue-action-icon"
                label={t("hero.share")}
                icon={<ShareIcon />}
                onClick={() => void shareVenue()}
              />
              </div>
            </>
          )}

          <div className="venue-page-actions-secondary venue-tiles">
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
                setEventOpen(true);
                setQuickOpen(false);
                setBookingOpen(false);
                setComingOpen(false);
              }}
            >
              <span className="venue-tile-icon">
                <CelebrationIcon />
              </span>
              <span className="venue-tile-text">
                <span className="venue-tile-name">{t("venue.event_tile_short")}</span>
                <span className="venue-tile-desc">{t("venue.event_tile_sub")}</span>
              </span>
            </button>
          </div>
        </div>

        {/* No tables in Seatiko yet (online booking soon): no rules, hall or waitlist to show. */}
        {bookable ? (
          <>
            <VenueBookingRules rules={bookingRules} allowPreorder={venue.allow_preorder !== false} />

            <section id="venue-floor" className="venue-section venue-section-floor">
              <div className="venue-section-head">
                <div>
                  <h2>{t("venue.choose_table")}</h2>
                  <p>{t("floor.pick_hint")}</p>
                </div>
              </div>

              {/* Nothing free right now: a collapsed waitlist card above the hall (the hall stays for later times). */}
              <WaitlistPanel
                venueId={venue.id}
                zones={zones}
                collapsible
                onAuthRequired={() => requireAuth(t("auth.reason_waitlist"))}
              />

              <div className="venue-floor-stage bench-stage-card">
                <TableFloorPlan
                  tables={tables}
                  selectedId={shownTable?.id}
                  mineReservationIds={myReservationIds}
                  onTableClick={(table) => {
                    setSelectedTableId(table.id);
                    setSheetMessage(null);
                    setBookingOpen(false);
                    setComingOpen(false);
                    setQuickOpen(false);
                    setEventOpen(false);
                  }}
                  legend={
                    <ScrollerFade className="bench-legend" ariaLabel={t("bench.legend")}>
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
                    </ScrollerFade>
                  }
                  inspector={
                    shownTable ? (
                      <TableInspector
                        table={shownTable}
                        tables={tables}
                        rules={bookingRules}
                        hoursOn={hoursOn}
                        schedule={schedule}
                        mineReservationIds={myReservationIds}
                        mine={isMyTable(shownTable, myReservationIds)}
                        onBook={openBooking}
                        onPickTable={(table) => {
                          setSelectedTableId(table.id);
                          setSheetMessage(null);
                        }}
                        onNotifyFree={(table) => void handleNotifyFree(table)}
                        notifyDone={notifySetIds.has(shownTable.id)}
                        onImComing={openComing}
                        comingAccess={comingAccessFor(shownTable)}
                        comingDone={Boolean(comingArrivalById[shownTable.id])}
                        comingTimeLabel={
                          comingArrivalById[shownTable.id]
                            ? new Date(comingArrivalById[shownTable.id]).toLocaleTimeString(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : undefined
                        }
                        onComingSignIn={() => requireAuth(t("auth.reason_coming"))}
                        message={selectedTable?.id === shownTable.id || !selectedTable ? sheetMessage : null}
                      />
                    ) : null
                  }
                />
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
                  initialTime={bookingStartIso}
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

            </section>
          </>
        ) : null}

        <VenueLocationMap
          venue={venue}
          bookable={bookable}
          freeTables={bookable ? freeCount : undefined}
          cover={photos[0] ? mediaUrl(photos[0]) : undefined}
        />

        <EventPopup venue={venue} open={eventOpen} onClose={() => setEventOpen(false)} />

        <AuthDialog
          open={pendingAuth !== null}
          reason={pendingAuth?.reason}
          onClose={() => setPendingAuth(null)}
          onSuccess={() => void handleAuthSuccess()}
        />

        {/* Reviews come untagged (BACKEND_TASKS №61): hide the block when none are in the guest's language. */}
        {reviews.length === 0 || visibleReviews.length > 0 ? (
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
              {visibleReviews.map((review, index) => {
                const when = reviewTimeLabel(review, locale);
                return (
                  <article key={`${review.author}-${index}`}>
                    <header>
                      <span className="venue-review-avatar" aria-hidden>
                        {review.author.trim().charAt(0).toUpperCase() || "·"}
                      </span>
                      <div>
                        <strong>{review.author}</strong>
                        {when ? <small>{when}</small> : null}
                      </div>
                      <Stars value={review.rating} />
                    </header>
                    <p>{review.text}</p>
                    {review.source === "google" && (
                      <span className="venue-review-source">Google</span>
                    )}
                  </article>
                );
              })}
              {reviews.length === 0 && (
                <p className="venue-page-empty-inline">{t("venue.reviews_empty")}</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  );
}
