"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SelectMenu } from "@/components/ui/select-menu";
import { useLocale, type Locale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";
import {
  fetchMe,
  fetchVenues,
  getToken,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  type Venue,
} from "@/lib/api";
import {
  addFavoriteVenue,
  loadGuestLocalPrefs,
  removeFavoriteVenue,
  saveGuestLocalPrefs,
} from "@/lib/guest-local-prefs";
import {
  VENUE_FILTER_IDS,
  isVenueFilter,
  matchesVenueFilter,
  matchesVenueQuery,
  type VenueFilter,
} from "@/lib/venue-filters";
import { venueBookingHref } from "@/lib/booking-link";
import { SearchIcon, SparklesIcon } from "@/components/venue-icons";

const SORT_IDS = [
  "recommended",
  "rating",
  "tables",
  "check_asc",
  "check_desc",
] as const;

type SortOption = (typeof SORT_IDS)[number];

function isSortOption(value: string | null): value is SortOption {
  return !!value && (SORT_IDS as readonly string[]).includes(value);
}

const SEARCH_URL_DEBOUNCE_MS = 300;

function catalogParams(query: string, filter: VenueFilter, sort: SortOption): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filter !== "all") params.set("filter", filter);
  if (sort !== "recommended") params.set("sort", sort);
  return params.toString();
}

type PluralForms = { one: string; few: string; many: string; other: string };

function pluralForm(locale: Locale, count: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(locale).select(count);
  return rule === "one" || rule === "few" || rule === "many" ? forms[rule] : forms.other;
}

function fill(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

function GridIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function VenuesCatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).catalog;
  const cuisineLabels: Record<string, string> = copy.cuisines;

  const paramsKey = searchParams.toString();
  const readQuery = () => searchParams.get("q") ?? "";
  const readFilter = (): VenueFilter => {
    const value = searchParams.get("filter");
    return isVenueFilter(value) ? value : "all";
  };
  const readSort = (): SortOption => {
    const value = searchParams.get("sort");
    return isSortOption(value) ? value : "recommended";
  };

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState(readQuery);
  const [activeFilter, setActiveFilter] = useState<VenueFilter>(readFilter);
  const [sortBy, setSortBy] = useState<SortOption>(readSort);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [userId, setUserId] = useState<string>("guest-local");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<ReadonlySet<string>>(() => new Set());

  // URL → state: adopt external URL changes (back/forward, links), but not our own writes,
  // so text typed while a write is in flight is not overwritten.
  const [syncedParamsKey, setSyncedParamsKey] = useState(paramsKey);
  const [lastWrittenKey, setLastWrittenKey] = useState<string | null>(null);
  if (syncedParamsKey !== paramsKey) {
    setSyncedParamsKey(paramsKey);
    if (paramsKey !== lastWrittenKey) {
      setSearchQuery(readQuery());
      setActiveFilter(readFilter());
      setSortBy(readSort());
    }
  }

  // State → URL
  useEffect(() => {
    const next = catalogParams(searchQuery, activeFilter, sortBy);
    if (next === paramsKey) return;
    const timer = setTimeout(() => {
      setLastWrittenKey(next);
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }, SEARCH_URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, activeFilter, sortBy, paramsKey, pathname, router]);

  // Load user and favorites
  useEffect(() => {
    let alive = true;
    const resolveUserId = getToken()
      ? fetchMe().then((u) => u.id).catch(() => null)
      : Promise.resolve(null);
    void resolveUserId.then((id) => {
      if (!alive) return;
      if (id) setUserId(id);
      const prefs = loadGuestLocalPrefs(id ?? "guest-local");
      setFavorites(prefs.favorites.map((fav) => fav.venueId));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fetch venues
  useEffect(() => {
    let alive = true;
    fetchVenues("all")
      .then((data) => {
        if (!alive) return;
        setVenues(data);
        setLoadError(false);
      })
      .catch(() => {
        if (!alive) return;
        setVenues([]);
        setLoadError(true);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey((key) => key + 1);
  };

  // Toggle favorite
  const handleToggleFavorite = (venue: Venue) => {
    const isFav = favorites.includes(venue.id);
    const prefs = loadGuestLocalPrefs(userId);
    const venueName = pickLocale(venue.name, locale);

    if (isFav) {
      const updated = removeFavoriteVenue(prefs, venue.id);
      saveGuestLocalPrefs(userId, updated);
      setFavorites(updated.favorites.map((f) => f.venueId));
      showToast(fill(copy.toastRemoved, { name: venueName }));
    } else {
      const updated = addFavoriteVenue(prefs, {
        venueId: venue.id,
        name: venueName,
      });
      saveGuestLocalPrefs(userId, updated);
      setFavorites(updated.favorites.map((f) => f.venueId));
      showToast(fill(copy.toastAdded, { name: venueName }));
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  // Filter & Sort Venues
  const filteredVenues = useMemo(() => {
    const filtered = venues.filter(
      (venue) => matchesVenueFilter(venue, activeFilter) && matchesVenueQuery(venue, searchQuery),
    );

    // Sorting
    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") {
        return b.rating - a.rating;
      }
      if (sortBy === "check_asc") {
        return a.average_check - b.average_check;
      }
      if (sortBy === "check_desc") {
        return b.average_check - a.average_check;
      }
      if (sortBy === "tables") {
        return b.free_tables - a.free_tables;
      }
      // recommended: prioritize available tables + high rating
      const scoreA = a.rating * 10 + (a.free_tables > 0 ? 5 : 0);
      const scoreB = b.rating * 10 + (b.free_tables > 0 ? 5 : 0);
      return scoreB - scoreA;
    });
  }, [venues, searchQuery, activeFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery("");
    setActiveFilter("all");
    setSortBy("recommended");
  };

  return (
    <div className="catalog-page">
      <SiteHeader />

      {toastMsg && (
        <div className="catalog-floating-toast" role="status">
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="catalog-main">
        {/* Hero Section */}
        <section className="catalog-hero">
          <div className="catalog-hero-topline">
            <span className="catalog-city-pill">
              {loading || loadError
                ? copy.cityPillLoading
                : fill(copy.cityPill, { count: venues.length })}
            </span>
          </div>

          <h1 className="catalog-title">{copy.title}</h1>
          <p className="catalog-lead">{copy.lead}</p>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="catalog-toolbar">
          {/* Main Search Input + Discover CTA */}
          <div className="catalog-search-row">
            <div className="catalog-search-wrap">
              <SearchIcon />
              <input
                type="text"
                className="catalog-search-input"
                placeholder={copy.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={copy.searchAria}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--icon catalog-search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label={copy.searchClear}
                >
                  ✕
                </button>
              )}
            </div>
            <Link href="/discover" className="btn btn--secondary btn--lg catalog-discover-btn">
              <SparklesIcon />
              <span>{copy.discoverChip}</span>
            </Link>
          </div>

          {/* Category Chips Bar */}
          <div className="catalog-chips-bar" role="group" aria-label={copy.filtersAria}>
            {VENUE_FILTER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip catalog-chip${activeFilter === id ? " is-active" : ""}`}
                aria-pressed={activeFilter === id}
                onClick={() => setActiveFilter(id)}
              >
                {copy.filters[id]}
              </button>
            ))}
          </div>

          {/* Sub-bar: Results count, sorting, view toggle */}
          <div className="catalog-meta-bar">
            <span className="catalog-count-label">
              {loading ? (
                copy.loadingCount
              ) : loadError ? null : (
                <>
                  {copy.found} <strong>{filteredVenues.length}</strong>{" "}
                  {pluralForm(locale, filteredVenues.length, copy.restaurants)}
                </>
              )}
            </span>

            <div className="catalog-meta-actions">
              <div className="catalog-sort-wrap">
                <label htmlFor="catalog-sort">{copy.sortLabel}</label>
                <SelectMenu
                  id="catalog-sort"
                  size="compact"
                  fullWidth={false}
                  align="end"
                  value={sortBy}
                  onChange={(value) => setSortBy(value as SortOption)}
                  options={SORT_IDS.map((id) => ({
                    value: id,
                    label: copy.sort[id],
                  }))}
                />
              </div>

              <div className="seg catalog-view-switch" role="group" aria-label={copy.viewAria}>
                <button
                  type="button"
                  className={`seg-item catalog-view-btn${viewMode === "grid" ? " is-active" : ""}`}
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  title={copy.viewGrid}
                  aria-label={copy.viewGrid}
                >
                  <GridIcon />
                </button>
                <button
                  type="button"
                  className={`seg-item catalog-view-btn${viewMode === "list" ? " is-active" : ""}`}
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                  title={copy.viewList}
                  aria-label={copy.viewList}
                >
                  <ListIcon />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Venues Grid / List */}
        {loading ? (
          <div className="catalog-loading-state">
            <div className="account-spinner" />
            <p>{copy.loading}</p>
          </div>
        ) : loadError ? (
          <div className="catalog-empty-card" role="alert">
            <div className="catalog-empty-icon">⚠️</div>
            <h3>{copy.errorTitle}</h3>
            <p>{copy.errorBody}</p>
            <button type="button" className="btn btn--primary btn--md" onClick={retryLoad}>
              {copy.errorRetry}
            </button>
          </div>
        ) : filteredVenues.length === 0 ? (
          <div className="catalog-empty-card">
            <div className="catalog-empty-icon">🍽️</div>
            <h3>{copy.emptyTitle}</h3>
            <p>
              {fill(copy.emptyBody, {
                query: searchQuery.trim() || copy.filters[activeFilter] || activeFilter,
              })}
            </p>
            <button
              type="button"
              className="btn btn--primary btn--md"
              onClick={clearFilters}
            >
              {copy.emptyReset}
            </button>
          </div>
        ) : (
          <div className={`catalog-venues-grid ${viewMode === "list" ? "list-view" : ""}`}>
            {filteredVenues.map((venue) => {
              const venueName = pickLocale(venue.name, locale);
              const venueDesc = pickLocale(venue.description, locale);
              const venueAddr = pickLocale(venue.address, locale);
              const isFav = favorites.includes(venue.id);
              const photoUrl = mediaUrl(venue.image_url || venue.photo_urls?.[0] || "");

              return (
                <article key={venue.id} className="catalog-card">
                  {/* Photo Container */}
                  <div className="catalog-card-media">
                    {photoUrl && !brokenPhotos.has(photoUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote venue photos from API / Places proxy
                      <img
                        src={photoUrl}
                        alt={venueName}
                        loading="lazy"
                        className="catalog-card-img"
                        onError={() =>
                          setBrokenPhotos((prev) => new Set(prev).add(photoUrl))
                        }
                      />
                    ) : (
                      <div className="catalog-card-img-fallback" aria-hidden="true">
                        <span>{venueName.trim().charAt(0).toUpperCase()}</span>
                      </div>
                    )}

                    {/* Status Badges Overlay */}
                    <div className="catalog-media-badges-top">
                      <span
                        className={`catalog-status-badge ${venue.open_now ? "open" : "closed"}`}
                      >
                        <span className="catalog-dot" />
                        {venue.open_now ? copy.open : copy.closed}
                      </span>

                      {venue.free_tables > 0 ? (
                        <span className="catalog-tables-badge available">
                          ●{" "}
                          {fill(pluralForm(locale, venue.free_tables, copy.freeTables), {
                            count: venue.free_tables,
                          })}
                        </span>
                      ) : (
                        <span className="catalog-tables-badge full">
                          {copy.onRequest}
                        </span>
                      )}
                    </div>

                    {/* Favorite Heart Button */}
                    <button
                      type="button"
                      className={`btn btn--secondary btn--sm btn--icon catalog-card-fav-btn${isFav ? " is-on" : ""}`}
                      aria-pressed={isFav}
                      onClick={() => handleToggleFavorite(venue)}
                      aria-label={isFav ? copy.favRemove : copy.favAdd}
                      title={isFav ? copy.favRemove : copy.favAdd}
                    >
                      {isFav ? "♥" : "♡"}
                    </button>

                    {/* Price Level Badge Overlay */}
                    <div className="catalog-media-badges-bottom">
                      <span className="catalog-price-badge">
                        {priceLevelLabel(venue.price_level)} · ~{venue.average_check} MDL
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="catalog-card-body">
                    <div className="catalog-card-header">
                      <h2 className="catalog-card-title">
                        <Link href={`/venues/${venue.id}`}>{venueName}</Link>
                      </h2>
                      <div className="catalog-card-rating">
                        <span className="catalog-rating-val">★ {venue.rating.toFixed(1)}</span>
                        {venue.review_count ? (
                          <span className="catalog-rating-count">({venue.review_count})</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Cuisine Tags */}
                    {venue.cuisine && venue.cuisine.length > 0 && (
                      <div className="catalog-card-cuisines">
                        {venue.cuisine.slice(0, 3).map((c) => (
                          <span key={c} className="catalog-cuisine-tag">
                            {cuisineLabels[c] ?? c}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Description */}
                    <p className="catalog-card-desc">{venueDesc}</p>

                    <div className="catalog-card-footer">
                      <div className="catalog-card-address">
                        <MapPinIcon />
                        <span>{venueAddr || copy.addressFallback}</span>
                      </div>

                      <div className="catalog-card-actions">
                        <Link
                          href={venueBookingHref(venue.id)}
                          className="btn btn--primary btn--md"
                        >
                          <span>{copy.bookAction}</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                        <Link
                          href={`/venues/${venue.id}`}
                          className="btn btn--secondary btn--md"
                        >
                          {copy.infoAction}
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default function VenuesCatalogPage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).catalog;
  return (
    <Suspense
      fallback={
        <div className="catalog-page">
          <SiteHeader />
          <main className="catalog-main">
            <div className="catalog-loading-state">
              <div className="account-spinner" />
              <p>{copy.loading}</p>
            </div>
          </main>
          <SiteFooter />
        </div>
      }
    >
      <VenuesCatalogContent />
    </Suspense>
  );
}
