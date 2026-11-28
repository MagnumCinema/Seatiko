"use client";

import "@/app/venue-map.css";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import {
  fetchMapConfig,
  fetchMapPlaces,
  fetchMe,
  fetchVenues,
  getToken,
  mediaUrl,
  pickLocale,
  type MapBounds,
  type MapConfig,
  type MapCoordinates,
  type MapPlace,
  type MapPlacesResponse,
} from "@/lib/api";
import {
  encodePreferences,
  filterAndRankPlaces,
  relaxPreference,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import {
  applyQuickFilters,
  areaChanged,
  clipBounds,
  isSavedPlace,
  placesInView,
  sheetHeights,
  shortPinName,
  terraceFilterAvailable,
  toggleQuickFilter,
  validBounds,
  type QuickFilter,
  type SheetSnap,
} from "@/lib/home-map";
import { loadGuestLocalPrefs } from "@/lib/guest-local-prefs";
import { googleMapSearch } from "@/lib/google-map";
import { applyMapLibreLocalization, getMapLibreLocale } from "@/lib/maplibre-locale";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import { GoogleVenueMap } from "@/components/google-venue-map";
import {
  MapSheet,
  MapStateCard,
  PlaceRow,
  PopupCard,
  RowSkeletons,
  SelectedCard,
  fill,
  freeTablesLabel,
  mapCopy,
} from "@/components/venue-map-parts";

type MapState = "loading" | "ready" | "error";

const DEFAULT_CITY = "city-balti";
const BALTI_BOUNDS: MapBounds = { south: 47.70, west: 27.84, north: 47.82, east: 28.02 };
const MOLDOVA_BOUNDS: MapBounds = { south: 45.45, west: 26.60, north: 48.55, east: 30.20 };
const OPEN_FREE_MAP_STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;
const SOURCE_ID = "seatiko-venues";
const CLUSTER_HALO_LAYER = "seatiko-cluster-halo";
const CLUSTER_LAYER = "seatiko-clusters";
const CLUSTER_COUNT_LAYER = "seatiko-cluster-count";
const OPEN_DOT_LAYER = "seatiko-open-dots";
const PARTNER_DOT_LAYER = "seatiko-partner-dots";
const CLICK_LAYERS = [CLUSTER_LAYER, OPEN_DOT_LAYER, PARTNER_DOT_LAYER];
/** From this zoom partners are pill pins (free tables + name) and nothing is clustered. */
const PIN_MIN_ZOOM = 14;
/** Zoom a selected place is shown at (never zooms out a closer view). */
const FOCUS_ZOOM = 15.2;
const SEARCH_DEBOUNCE_MS = 350;
const RECOMMENDED_LIST_COUNT = 3;
const COMPACT_LIST_COUNT = 6;
const PHONE_QUERY = "(max-width: 720px)";
/** Site palette on the map: partners green, open data sage, the selected place gold. */
const MAP_COLORS = {
  light: { partner: "#175f43", cluster: "#1f6848", other: "#6f8679", selected: "#d99a3e", stroke: "#fffdf8" },
  dark: { partner: "#2f9468", cluster: "#1f6848", other: "#7d9486", selected: "#e9b96e", stroke: "#f3efe6" },
} as const;

type PointProps = { placeId: string; inDatabase: boolean };

function placeCollection(places: MapPlace[]): GeoJSON.FeatureCollection<GeoJSON.Point, PointProps> {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      properties: { placeId: place.id, inDatabase: place.in_database },
    })),
  };
}

function sortPlaces(places: MapPlace[], searching: boolean): MapPlace[] {
  return [...places].sort((a, b) => {
    if (a.in_database !== b.in_database) return a.in_database ? -1 : 1;
    if (searching && !a.in_database) return 0;
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    const nameA = a.name.en || a.name.ru || a.name.ro || "";
    const nameB = b.name.en || b.name.ru || b.name.ro || "";
    return nameA.localeCompare(nameB);
  });
}

function boundsOf(map: maplibregl.Map): MapBounds {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

function subscribeMedia(callback: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function useIsPhone(): boolean {
  return useSyncExternalStore(subscribeMedia, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/** Favourite venue ids: the guest's local list plus `User.favorite_venues` when signed in. */
function useSavedVenues(): ReadonlySet<string> {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    const load = () => {
      const token = getToken();
      const user = token ? fetchMe().catch(() => null) : Promise.resolve(null);
      void user.then((me) => {
        if (!alive) return;
        const local = loadGuestLocalPrefs(me?.id ?? "guest-local").favorites.map((fav) => fav.venueId);
        setSaved(new Set([...local, ...(me?.favorite_venues ?? [])]));
      });
    };
    load();
    window.addEventListener("storage", load);
    return () => {
      alive = false;
      window.removeEventListener("storage", load);
    };
  }, []);
  return saved;
}

/** Partner photos until `MapPlace.cover_url` exists (BACKEND_TASKS №70): one `/venues` call per city. */
function useVenueCovers(cityId: string): Record<string, string> {
  const [covers, setCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchVenues(cityId === "all" ? "all" : cityId)
      .then((venues) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        for (const venue of venues) {
          const url = venue.photo_urls?.[0] || venue.image_url;
          if (url) next[venue.id] = mediaUrl(url);
        }
        setCovers(next);
      })
      .catch(() => { /* no photos: cards use the compact layout */ });
    return () => { alive = false; };
  }, [cityId]);
  return covers;
}

type VenueMapProps = { compact?: boolean; preferences?: DiscoverPreferences };
type AreaStats = { shown: number; total: number; terrace: boolean; loading: boolean };

export function VenueMap(props: VenueMapProps) {
  const { locale } = useLocale();
  const [config, setConfig] = useState<MapConfig | null | undefined>();
  const [cityId, setCityId] = useState(DEFAULT_CITY);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ReadonlySet<QuickFilter>>(() => new Set());
  const [stats, setStats] = useState<AreaStats>({ shown: 0, total: 0, terrace: false, loading: true });
  const saved = useSavedVenues();

  useEffect(() => {
    let active = true;
    fetchMapConfig()
      .then((result) => { if (active) setConfig(result); })
      .catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, []);

  // Search as you type (M3); Enter applies at once.
  useEffect(() => {
    const next = searchText.trim();
    if (next === query) return;
    const timer = window.setTimeout(() => setQuery(next), next ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [searchText, query]);

  const { vm, hm } = mapCopy(locale);
  const cities = (config?.cities ?? []).filter((city) => city.country === "MD" && city.bounds);
  const city = cities.find((item) => item.id === cityId);
  const name = cityId === "all" ? vm.countryName : city ? pickLocale(city.name, locale) : vm.defaultCity;
  const bounds = cityId === "all" ? config?.country_bounds ?? MOLDOVA_BOUNDS : city?.bounds ?? BALTI_BOUNDS;
  const comingSoon = Boolean(city && !city.available);
  const externalUrl = googleMapSearch(`${searchText.trim() || vm.food} ${name}`);
  const chips: { id: QuickFilter; label: string }[] = [
    { id: "bookable", label: hm.chipBookable },
    { id: "openNow", label: hm.chipOpenNow },
    ...(stats.terrace || filters.has("terrace") ? [{ id: "terrace" as const, label: hm.chipTerrace }] : []),
    { id: "saved", label: hm.chipSaved },
  ];
  const resetFilters = useCallback(() => {
    setFilters(new Set());
    setSearchText("");
    setQuery("");
  }, []);

  return (
    <div className={`vmap${props.compact ? " is-compact" : ""}`}>
      <form
        className="vmap-toolbar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(searchText.trim());
        }}
      >
        <div className="vmap-toolbar-main">
          <SelectMenu
            className="vmap-city"
            buttonClassName="vmap-city-trigger"
            ariaLabel={hm.cityAria}
            value={cityId}
            onChange={setCityId}
            options={[
              ...(!cities.some((item) => item.id === DEFAULT_CITY) ? [{ value: DEFAULT_CITY, label: vm.defaultCity }] : []),
              ...cities.map((item) => ({
                value: item.id,
                label: pickLocale(item.name, locale),
                badge: item.available ? undefined : vm.soon,
              })),
              { value: "all", label: vm.country },
            ]}
          />
          <label className="vmap-search">
            <svg className="vmap-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7.5" />
              <path d="m20.5 20.5-4.2-4.2" />
            </svg>
            <span className="sr-only">{vm.query}</span>
            <input
              type="search"
              placeholder={hm.searchPlaceholder}
              value={searchText}
              maxLength={100}
              enterKeyHint="search"
              onChange={(event) => setSearchText(event.target.value)}
            />
            {searchText ? (
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm vmap-search-clear"
                aria-label={vm.clearSearch}
                title={vm.clearSearch}
                onClick={() => { setSearchText(""); setQuery(""); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </label>
          <a
            className="btn btn--ghost btn--md vmap-external"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={hm.googleMapsAria}
            title={hm.googleMapsAria}
          >
            <span className="vmap-external-label">{hm.googleMaps}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        </div>
        <div className="vmap-toolbar-chips">
          <div className="vmap-chips" role="group" aria-label={hm.filtersAria}>
            <button type="button" className="chip" aria-pressed={filters.size === 0} onClick={() => setFilters(new Set())}>
              {hm.chipAll}
            </button>
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="chip"
                aria-pressed={filters.has(chip.id)}
                onClick={() => setFilters((current) => toggleQuickFilter(current, chip.id))}
              >
                {chip.id === "saved" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.2 3.9 13.3a5.2 5.2 0 0 1 7.4-7.4l.7.7.7-.7a5.2 5.2 0 0 1 7.4 7.4z" />
                  </svg>
                ) : null}
                {chip.label}
              </button>
            ))}
          </div>
          <span className="vmap-count" aria-live="polite">
            <i aria-hidden="true" />
            {stats.loading ? vm.loadingVenues : fill(hm.shownOf, { shown: stats.shown, total: stats.total })}
          </span>
        </div>
      </form>
      {config === undefined ? (
        <div className="vmap-shell">
          <div className="vmap-canvas" role="status">
            <div className="vmap-loading"><span /><p>{vm.loadingMap}</p></div>
          </div>
        </div>
      ) : (
        <VenueMapArea
          key={cityId}
          {...props}
          cityId={cityId}
          cityName={name}
          bounds={bounds}
          config={config}
          externalUrl={externalUrl}
          query={query}
          filters={filters}
          saved={saved}
          comingSoon={comingSoon}
          onStats={setStats}
          onResetFilters={resetFilters}
          onShowDefaultCity={() => setCityId(DEFAULT_CITY)}
        />
      )}
    </div>
  );
}

type AreaProps = VenueMapProps & {
  cityId: string;
  cityName: string;
  bounds: MapBounds;
  config: MapConfig | null;
  externalUrl: string;
  query: string;
  filters: ReadonlySet<QuickFilter>;
  saved: ReadonlySet<string>;
  comingSoon: boolean;
  onStats: (stats: AreaStats) => void;
  onResetFilters: () => void;
  onShowDefaultCity: () => void;
};

function VenueMapArea({
  compact = false, preferences, cityId, cityName, bounds, config, externalUrl, query, filters, saved, comingSoon,
  onStats, onResetFilters, onShowDefaultCity,
}: AreaProps) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const { theme } = useTheme();
  const isPhone = useIsPhone();
  const { vm, hm, site } = mapCopy(locale);
  const discoverCopy = site.discover;
  const covers = useVenueCovers(cityId);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const placesRef = useRef<MapPlace[]>([]);
  const localeRef = useRef(locale);
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>());
  const baselineRef = useRef<MapBounds | null>(null);
  const scrollOnSelectRef = useRef(false);
  const stateRef = useRef<{ selected: string | null; hovered: string | null }>({ selected: null, hovered: null });

  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyDenied, setNearbyDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [popupNode] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const [mapState, setMapState] = useState<MapState>("loading");
  const [loadedMap, setLoadedMap] = useState<maplibregl.Map | null>(null);
  const [pinZoom, setPinZoom] = useState(false);
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null);
  const [areaDirty, setAreaDirty] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [viewport, setViewport] = useState<MapBounds>();
  const [focus, setFocus] = useState<MapCoordinates | null>(null);
  const [retry, setRetry] = useState(0);
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [canvasHeight, setCanvasHeight] = useState(600);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const googleKey = config?.google_maps_key;
  const useGoogle = Boolean(googleKey) && !googleFailed;
  const bookableOnly = filters.has("bookable");
  // Without a Google key the API still adds open-data places (OpenStreetMap, Overture).
  const includeGoogle = (useGoogle ? googleReady : true) && !bookableOnly;
  const validViewport = validBounds(viewport) ? viewport : undefined;
  const encodedPrefs = preferences ? encodePreferences(preferences) : "";
  const near = preferences?.practical.includes("nearby") ? userGeo : null;
  const request = useMemo(
    () => ({ cityId, includeGoogle, locale, bounds: validViewport, query, bookableOnly, filters: encodedPrefs, near, retry }),
    [cityId, includeGoogle, locale, validViewport, query, bookableOnly, encodedPrefs, near, retry],
  );
  const [result, setResult] = useState<{ request: typeof request; data: MapPlacesResponse | null }>();
  const loading = result?.request !== request;
  // While a new request runs the previous places stay on the map (no flash of the empty state).
  const data = result?.data ?? undefined;
  const loadError = !loading && result?.data === null;
  const googleStatus = data?.source.google_status;

  // "Открыто · до 23:00" follows the clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const googleLoaded = useCallback(() => {
    setGoogleReady(true);
    setMapState("ready");
  }, []);
  const useFallback = useCallback(() => {
    setGoogleFailed(true);
    setMapState("loading");
  }, []);
  const searchArea = useCallback((next: MapBounds) => {
    // The API clips the visible area to the currently selected city or country.
    setViewport(clipBounds(next, bounds));
  }, [bounds]);

  const ranked = useMemo(() => {
    const visible = data?.places ?? [];
    if (!preferences) return visible.map((place) => ({ place, score: 0 }));
    return filterAndRankPlaces(visible, preferences, { userLat: userGeo?.lat, userLng: userGeo?.lng });
  }, [data, preferences, userGeo]);
  const totalCount = ranked.length;
  const places = useMemo(
    () => applyQuickFilters(ranked.map((r) => r.place), filters, saved),
    [ranked, filters, saved],
  );
  const terraceAvailable = useMemo(() => terraceFilterAvailable(data?.places ?? []), [data]);

  useEffect(() => {
    onStats({ shown: places.length, total: totalCount, terrace: terraceAvailable, loading: loading && !data });
  }, [places.length, totalCount, terraceAvailable, loading, data, onStats]);

  useEffect(() => { placesRef.current = places; }, [places]);
  useEffect(() => { localeRef.current = locale; }, [locale]);

  useEffect(() => {
    if (!preferences?.practical.includes("nearby")) {
      queueMicrotask(() => {
        setNearbyDenied(false);
        setUserGeo(null);
      });
      return;
    }
    if (!navigator.geolocation) {
      queueMicrotask(() => setNearbyDenied(true));
      return;
    }
    queueMicrotask(() => setNearbyDenied(false));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearbyDenied(false);
        setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setUserGeo(null);
        setNearbyDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [preferences]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMapPlaces(request.cityId, { ...request, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const sorted = sortPlaces(response.places ?? [], Boolean(request.query));
        setResult({ request, data: { ...response, places: sorted } });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ request, data: null }); });
    return () => controller.abort();
  }, [request]);

  const selected = useMemo(
    () => places.find((place) => place.id === selectedId) ?? places[0] ?? null,
    [selectedId, places],
  );
  const popupPlace = useMemo(() => (popupId ? places.find((place) => place.id === popupId) ?? null : null), [popupId, places]);
  const coverOf = useCallback(
    (place: MapPlace) => place.cover_url ? mediaUrl(place.cover_url) : place.venue_id ? covers[place.venue_id] : undefined,
    [covers],
  );

  /** Scrolls the list (rail or sheet) so the row is visible, without moving the page. */
  const revealRow = useCallback((id: string) => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(id)}"]`);
    if (!list || !row) return;
    // .vmap-list is position: relative, so offsetTop is measured from the list.
    const top = row.offsetTop;
    const target = top - (list.clientHeight - row.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, []);

  const focusPlace = (place: MapPlace) => {
    const map = mapRef.current;
    if (map) {
      map.easeTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 520 });
    } else if (useGoogle) {
      setFocus({ lat: place.lat, lng: place.lng });
    }
  };

  /** A pin or dot on the map: select, open the popup (desktop), bring the list row into view. */
  const selectFromMap = (place: MapPlace) => {
    setSelectedId(place.id);
    scrollOnSelectRef.current = true;
    focusPlace(place);
    if (window.matchMedia(PHONE_QUERY).matches) {
      setSnap("peek");
      setPopupId(null);
    } else {
      setPopupId(place.id);
    }
  };

  /** A list row: select, centre the map on it and open its popup (desktop). */
  const selectFromList = (place: MapPlace) => {
    setSelectedId(place.id);
    focusPlace(place);
    if (isPhone) {
      setSnap("peek");
      setPopupId(null);
    } else if (!useGoogle) {
      setPopupId(place.id);
    }
  };

  useEffect(() => {
    if (!scrollOnSelectRef.current || !selected) return;
    scrollOnSelectRef.current = false;
    revealRow(selected.id);
  }, [selected, revealRow]);

  // Phone sheet heights follow the canvas.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCanvasHeight(Math.round(entry.contentRect.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Event handlers registered once per map read the latest callback through a ref.
  const selectFromMapRef = useRef(selectFromMap);
  useEffect(() => { selectFromMapRef.current = selectFromMap; });

  /* —— MapLibre: map, clustered source, layers and events —— */
  useEffect(() => {
    if (useGoogle || !mapNodeRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: OPEN_FREE_MAP_STYLE[theme],
        bounds: [[bounds.west, bounds.south], [bounds.east, bounds.north]],
        fitBoundsOptions: { padding: 24, duration: 0 },
        minZoom: 5,
        maxZoom: 19,
        cooperativeGestures: true,
        attributionControl: false,
        locale: getMapLibreLocale(localeRef.current),
      });
    } catch {
      queueMicrotask(() => setMapState("error"));
      return;
    }
    mapRef.current = map;
    // ODbL: OpenStreetMap data (tiles and places) must be credited; folded into an (i) button.
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Places: © OpenStreetMap contributors, Overture Maps Foundation" }),
      "bottom-right",
    );
    // The stock control draws the "you are here" dot; our own button triggers it.
    const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false });
    map.addControl(geolocate, "bottom-left");
    geolocateRef.current = geolocate;
    const colors = MAP_COLORS[theme];

    map.once("load", () => {
      map.getContainer().querySelectorAll(".maplibregl-compact-show").forEach((el) => el.classList.remove("maplibregl-compact-show"));
      applyMapLibreLocalization(map, localeRef.current);
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: placeCollection(placesRef.current),
        cluster: true,
        clusterMaxZoom: PIN_MIN_ZOOM - 1,
        clusterRadius: 46,
        clusterProperties: { partners: ["+", ["case", ["==", ["get", "inDatabase"], true], 1, 0]] },
        promoteId: "placeId",
      });
      const isCluster: maplibregl.FilterSpecification = ["has", "point_count"];
      const clusterColor: maplibregl.ExpressionSpecification = ["case", [">", ["get", "partners"], 0], colors.cluster, colors.other];
      const clusterSize: maplibregl.ExpressionSpecification = ["step", ["get", "point_count"], 17, 10, 21, 25, 26];
      map.addLayer({
        id: CLUSTER_HALO_LAYER, type: "circle", source: SOURCE_ID, filter: isCluster,
        paint: { "circle-color": clusterColor, "circle-opacity": 0.28, "circle-radius": ["+", clusterSize, 6] },
      });
      map.addLayer({
        id: CLUSTER_LAYER, type: "circle", source: SOURCE_ID, filter: isCluster,
        paint: { "circle-color": clusterColor, "circle-radius": clusterSize, "circle-stroke-width": 2, "circle-stroke-color": colors.stroke, "circle-stroke-opacity": 0.9 },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER, type: "symbol", source: SOURCE_ID, filter: isCluster,
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      const selectedState: maplibregl.ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
      const hoverState: maplibregl.ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
      map.addLayer({
        id: OPEN_DOT_LAYER, type: "circle", source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "inDatabase"], true]],
        paint: {
          "circle-color": ["case", selectedState, colors.selected, colors.other],
          "circle-radius": ["case", selectedState, 9, hoverState, 9, 7],
          "circle-opacity": ["case", selectedState, 1, hoverState, 1, 0.85],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": colors.stroke,
        },
      });
      map.addLayer({
        id: PARTNER_DOT_LAYER, type: "circle", source: SOURCE_ID, maxzoom: PIN_MIN_ZOOM,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "inDatabase"], true]],
        paint: {
          "circle-color": ["case", selectedState, colors.selected, colors.partner],
          "circle-radius": ["case", selectedState, 10, hoverState, 10, 8],
          "circle-stroke-width": 2,
          "circle-stroke-color": colors.stroke,
        },
      });

      map.on("click", CLUSTER_LAYER, (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = Number(feature?.properties?.cluster_id);
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!feature || !source || Number.isNaN(clusterId)) return;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng, lat], zoom: Math.min(zoom + 0.2, 18), duration: 480 }, { userAction: true });
        }).catch(() => {});
      });
      const onDotClick = (event: maplibregl.MapLayerMouseEvent) => {
        const placeId = String(event.features?.[0]?.properties?.placeId ?? "");
        const place = placesRef.current.find((item) => item.id === placeId);
        if (place) selectFromMapRef.current(place);
      };
      map.on("click", OPEN_DOT_LAYER, onDotClick);
      map.on("click", PARTNER_DOT_LAYER, onDotClick);
      map.on("click", (event) => {
        const target = event.originalEvent.target as HTMLElement | null;
        if (target?.closest(".vmap-pin")) return;
        if (map.queryRenderedFeatures(event.point, { layers: CLICK_LAYERS }).length === 0) setPopupId(null);
      });
      CLICK_LAYERS.forEach((layerId) => {
        map.on("mouseenter", layerId, (event) => {
          map.getCanvas().style.cursor = "pointer";
          const placeId = event.features?.[0]?.properties?.placeId;
          if (placeId) setHoveredId(String(placeId));
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          setHoveredId(null);
        });
      });

      setPinZoom(map.getZoom() >= PIN_MIN_ZOOM);
      baselineRef.current = boundsOf(map);
      setViewBounds(boundsOf(map));
      setMapState("ready");
      setLoadedMap(map);
    });
    map.on("zoom", () => setPinZoom(map.getZoom() >= PIN_MIN_ZOOM));
    map.on("moveend", (event: maplibregl.MapLibreEvent & { userAction?: boolean }) => {
      const current = boundsOf(map);
      setViewBounds(current);
      const user = Boolean(event.originalEvent) || event.userAction === true;
      if (user && baselineRef.current && areaChanged(current, baselineRef.current)) setAreaDirty(true);
    });
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });

    const markers = markersRef.current;
    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      mapRef.current = null;
      geolocateRef.current = null;
      setLoadedMap(null);
      map.remove();
    };
    // A theme switch rebuilds the map on the matching (light or dark) tiles.
  }, [bounds, useGoogle, theme]);

  // Places → clustered source.
  useEffect(() => {
    const map = loadedMap;
    if (!map) return;
    applyMapLibreLocalization(map, locale);
    (map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(placeCollection(places));
  }, [loadedMap, places, locale]);

  // Selected / hovered → feature state of the dots.
  useEffect(() => {
    const map = loadedMap;
    if (!map || !map.getSource(SOURCE_ID)) return;
    const prev = stateRef.current;
    const nextSelected = selected?.id ?? null;
    if (prev.selected && prev.selected !== nextSelected) map.removeFeatureState({ source: SOURCE_ID, id: prev.selected }, "selected");
    if (prev.hovered && prev.hovered !== hoveredId) map.removeFeatureState({ source: SOURCE_ID, id: prev.hovered }, "hover");
    if (nextSelected) map.setFeatureState({ source: SOURCE_ID, id: nextSelected }, { selected: true });
    if (hoveredId) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });
    stateRef.current = { selected: nextSelected, hovered: hoveredId };
  }, [loadedMap, selected, hoveredId, places]);

  // Partner pill pins (M1): free tables + short name, ♥ when saved; shown from PIN_MIN_ZOOM.
  useEffect(() => {
    const map = loadedMap;
    const markers = markersRef.current;
    markers.forEach(({ marker }) => marker.remove());
    markers.clear();
    if (!map) return;
    for (const place of places) {
      if (!place.in_database) continue;
      const name = pickLocale(place.name, locale);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "vmap-pin";
      el.dataset.placeId = place.id;
      const bookable = place.bookable && typeof place.free_tables === "number";
      const parts: string[] = [name];
      if (bookable) parts.push(`${place.free_tables} ${freeTablesLabel(locale, place.free_tables ?? 0)}`);
      if (isSavedPlace(place, saved)) {
        el.classList.add("is-saved");
        parts.push(mapCopy(locale).hm.saved);
        const heart = document.createElement("span");
        heart.className = "vmap-pin-heart";
        heart.setAttribute("aria-hidden", "true");
        heart.textContent = "♥";
        el.appendChild(heart);
      }
      if (bookable) {
        const free = document.createElement("span");
        free.className = "vmap-pin-free";
        free.textContent = String(place.free_tables);
        if (!place.free_tables) el.classList.add("is-full");
        el.appendChild(free);
      } else {
        el.classList.add("is-quiet");
      }
      const label = document.createElement("span");
      label.className = "vmap-pin-name";
      label.textContent = shortPinName(name);
      el.appendChild(label);
      el.setAttribute("aria-label", parts.join(", "));
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        selectFromMapRef.current(place);
      });
      el.addEventListener("mouseenter", () => setHoveredId(place.id));
      el.addEventListener("mouseleave", () => setHoveredId(null));
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      markers.set(place.id, { marker, el });
    }
  }, [loadedMap, places, locale, saved]);

  // Pill classes follow selection and list hover without rebuilding the markers.
  useEffect(() => {
    markersRef.current.forEach(({ el, marker }, id) => {
      const active = id === selected?.id;
      el.classList.toggle("is-active", active);
      el.classList.toggle("is-hovered", id === hoveredId);
      el.setAttribute("aria-pressed", String(active));
      marker.getElement().style.zIndex = active ? "3" : id === hoveredId ? "2" : "";
    });
  }, [selected, hoveredId, places, saved, locale, loadedMap]);

  // Desktop popup: a MapLibre popup whose content is rendered by React (portal).
  useEffect(() => {
    const map = loadedMap;
    if (!map || !popupPlace || isPhone || !popupNode) return;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      maxWidth: "none",
      className: "vmap-popup",
      offset: popupPlace.in_database ? 36 : 12,
    })
      .setLngLat([popupPlace.lng, popupPlace.lat])
      .setDOMContent(popupNode)
      .addTo(map);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPopupId(null); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popup.remove();
    };
    // Re-anchor only when another place opens (not on every list refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedMap, popupPlace?.id, isPhone, popupNode]);

  const listPlaces = useMemo(() => {
    const inView = useGoogle ? places : placesInView(places, viewBounds);
    return compact ? inView.slice(0, COMPACT_LIST_COUNT) : inView;
  }, [places, viewBounds, useGoogle, compact]);
  const recommendCount = preferences ? Math.min(RECOMMENDED_LIST_COUNT, listPlaces.length) : 0;
  const filtersActive = filters.size > 0 || Boolean(query) || Boolean(preferences);

  // Which centred state covers the map canvas, if any.
  const state: "soon" | "error" | "empty" | null =
    comingSoon && !loading && places.length === 0 ? "soon"
      : loadError ? "error"
        : !loading && data && places.length === 0 ? "empty"
          : null;
  const showSheet = isPhone && state === null;
  const heights = sheetHeights(canvasHeight);
  const sheetHeight = showSheet ? heights[snap] : 0;
  const showSearchArea = !useGoogle && mapState === "ready" && areaDirty && !loading && state === null;

  const applySearchArea = () => {
    const map = mapRef.current;
    if (!map) return;
    const current = boundsOf(map);
    baselineRef.current = current;
    setAreaDirty(false);
    setPopupId(null);
    searchArea(current);
  };
  const showWholeCity = () => {
    setViewport(undefined);
    setAreaDirty(false);
    const map = mapRef.current;
    map?.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 24, duration: 480 });
    if (map) baselineRef.current = null;
  };

  const emptyBody = query ? hm.emptySearchBody : hm.emptyBody;
  const relax = preferences && data?.filters?.relax ? data.filters.relax : null;
  const relaxLabel = relax
    ? t("map.relax", {
      filter:
        relax.filter === "cuisine" || relax.filter === "budget"
          ? discoverCopy.steps[relax.filter]
          : (discoverCopy.chips[relax.filter as keyof typeof discoverCopy.chips] ?? relax.filter),
      count: relax.matched,
    })
    : null;

  const renderRows = () => (
    <>
      {listPlaces.map((place, index) => (
        <div key={place.id} className="vmap-row-wrap">
          {preferences && index === 0 && recommendCount > 0 ? (
            <div className="vmap-list-heading" role="presentation">{discoverCopy.recommended}</div>
          ) : null}
          {preferences && index === recommendCount && recommendCount > 0 ? (
            <div className="vmap-list-heading is-more" role="presentation">{vm.listPartners}</div>
          ) : null}
          <PlaceRow
            place={place}
            cover={coverOf(place)}
            locale={locale}
            saved={saved}
            active={place.id === selected?.id}
            hovered={place.id === hoveredId}
            recommended={index < recommendCount}
            onSelect={selectFromList}
            onHover={isPhone ? undefined : setHoveredId}
          />
        </div>
      ))}
    </>
  );

  const listNotes = (
    <>
      {!loading && preferences && data?.filters ? (
        <p className="vmap-note is-accent" role="status">{t("map.found", { matched: data.filters.matched, total: data.filters.total })}</p>
      ) : null}
      {useGoogle && (googleStatus === "unavailable" || googleStatus === "disabled") ? <p className="vmap-note" role="status">{vm.providerError}</p> : null}
      {nearbyDenied ? <p className="vmap-note" role="status">{discoverCopy.nearbyDenied}</p> : null}
    </>
  );

  const toggleFullscreen = () => {
    const node = shellRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen?.().catch(() => {});
  };
  const canFullscreen = !compact && typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  return (
    <div ref={shellRef} className={`vmap-shell${fullscreen ? " is-fullscreen" : ""}${state ? " has-state" : ""}`}>
      <div
        ref={canvasRef}
        className={`vmap-canvas${useGoogle ? " is-google" : ""}`}
        data-pin-zoom={pinZoom ? "" : undefined}
        data-state={state ?? undefined}
        style={{ "--vmap-sheet-h": `${sheetHeight}px` } as CSSProperties}
        aria-label={vm.aria}
        aria-busy={loading}
      >
        {useGoogle && googleKey ? (
          <GoogleVenueMap
            apiKey={googleKey} mapId={config?.google_maps_id ?? ""} bounds={bounds}
            places={places} locale={locale} focus={focus} compact={compact} searchLabel={hm.searchArea}
            onReady={googleLoaded} onError={useFallback} onSelect={setSelectedId} onSearch={searchArea}
          />
        ) : (
          <div ref={mapNodeRef} className="vmap-surface" />
        )}

        {mapState === "loading" ? (
          <div className="vmap-loading" role="status"><span /><p>{vm.loadingMap}</p></div>
        ) : null}

        {mapState === "error" ? (
          <div className="vmap-fallback" role="status">
            <div className="vmap-fallback-card">
              <strong>{vm.unavailable}</strong>
              <p>{vm.unavailableBody}</p>
              <a className="btn btn--secondary btn--sm" href={externalUrl} target="_blank" rel="noreferrer">
                <span>{hm.googleMaps}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
              </a>
            </div>
          </div>
        ) : null}

        {mapState === "ready" && !useGoogle ? (
          <div className="vmap-controls">
            <div className="vmap-control-stack">
              {canFullscreen ? (
                <button type="button" className="vmap-control" onClick={toggleFullscreen} aria-label={fullscreen ? hm.exitFullscreen : hm.fullscreen} title={fullscreen ? hm.exitFullscreen : hm.fullscreen}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
                  </svg>
                </button>
              ) : null}
              <button type="button" className="vmap-control" onClick={() => geolocateRef.current?.trigger()} aria-label={hm.locate} title={hm.locate}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              </button>
            </div>
            <div className="vmap-control-stack">
              <button type="button" className="vmap-control" onClick={() => mapRef.current?.zoomIn({ duration: 240 }, { userAction: true })} aria-label={hm.zoomIn} title={hm.zoomIn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button type="button" className="vmap-control" onClick={() => mapRef.current?.zoomOut({ duration: 240 }, { userAction: true })} aria-label={hm.zoomOut} title={hm.zoomOut}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
            </div>
          </div>
        ) : null}

        {showSearchArea ? (
          <button type="button" className="vmap-search-area" onClick={applySearchArea}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
            </svg>
            <span>{hm.searchArea}</span>
          </button>
        ) : null}

        {mapState === "ready" && state === null && places.length > 0 ? (
          <div className="vmap-legend" aria-label={hm.legendAria}>
            <span><i className="vmap-legend-dot is-partner" /> {hm.legendPartner}</span>
            {places.some((place) => !place.in_database) ? <span><i className="vmap-legend-dot is-open" /> {hm.legendOpen}</span> : null}
            {places.some((place) => isSavedPlace(place, saved)) ? <span><i className="vmap-legend-heart" aria-hidden="true">♥</i> {hm.legendSaved}</span> : null}
          </div>
        ) : null}

        {state === "soon" ? (
          <MapStateCard tone="soon" badge={fill(hm.soonBadge, { city: cityName })} title={hm.soonTitle} body={hm.soonBody}>
            <button type="button" className="btn btn--primary btn--md" onClick={onShowDefaultCity}>
              <span>{vm.soonAction}</span><span aria-hidden="true">→</span>
            </button>
            <a className="btn btn--secondary btn--md" href={externalUrl} target="_blank" rel="noreferrer">
              <span>{hm.googleMaps}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
            </a>
          </MapStateCard>
        ) : null}
        {state === "error" ? (
          <MapStateCard badge={vm.unavailable} title={vm.loadError} body={vm.unavailableBody}>
            <button type="button" className="btn btn--primary btn--md" onClick={() => setRetry((attempt) => attempt + 1)}>{vm.retry}</button>
          </MapStateCard>
        ) : null}
        {state === "empty" ? (
          filtersActive || validViewport ? (
            <MapStateCard badge={hm.emptyBadge} title={hm.emptyTitle} body={emptyBody}>
              {relax && relaxLabel ? (
                <button
                  type="button"
                  className="btn btn--primary btn--md"
                  onClick={() => {
                    const next = encodePreferences(relaxPreference(preferences!, relax.filter));
                    router.replace(next ? `/?${next}#map` : "/#map", { scroll: false });
                  }}
                >
                  {relaxLabel}
                </button>
              ) : filters.size > 0 || query ? (
                <button type="button" className="btn btn--primary btn--md" onClick={onResetFilters}>{hm.resetFilters}</button>
              ) : null}
              {validViewport ? (
                <button type="button" className="btn btn--secondary btn--md" onClick={showWholeCity}>{hm.wholeCity}</button>
              ) : null}
            </MapStateCard>
          ) : (
            <MapStateCard badge={vm.emptyArea} title={vm.emptyArea} body={vm.empty} />
          )
        ) : null}

        {showSheet ? (
          <MapSheet locale={locale} snap={snap} heights={heights} count={listPlaces.length} onSnap={setSnap}>
            {snap === "peek" ? (
              selected ? (
                <SelectedCard place={selected} cover={coverOf(selected)} locale={locale} now={now} compact />
              ) : (
                <p className="vmap-note">{loading ? vm.loadingVenues : hm.selectHint}</p>
              )
            ) : (
              <>
                {snap === "half" && selected ? (
                  <SelectedCard place={selected} cover={coverOf(selected)} locale={locale} now={now} />
                ) : null}
                {listNotes}
                <div ref={listRef} className="vmap-list" aria-label={hm.railAria}>
                  {loading && !data ? <RowSkeletons /> : renderRows()}
                </div>
              </>
            )}
          </MapSheet>
        ) : null}
      </div>

      {!isPhone && !state ? (
        <aside className="vmap-rail" aria-label={hm.railAria}>
          <div className="vmap-rail-head">
            <span>{hm.railTitle}</span>
            <span className="vmap-rail-count">{listPlaces.length} / {places.length}</span>
          </div>
          {listNotes}
          <div ref={listRef} className="vmap-list" aria-busy={loading}>
            {loading && !data ? <RowSkeletons /> : renderRows()}
          </div>
          {selected && state === null ? (
            <div className="vmap-dock">
              <SelectedCard place={selected} cover={coverOf(selected)} locale={locale} now={now} />
            </div>
          ) : null}
        </aside>
      ) : null}

      {popupNode && popupPlace && !isPhone
        ? createPortal(
          <PopupCard place={popupPlace} cover={coverOf(popupPlace)} locale={locale} now={now} saved={saved} onClose={() => setPopupId(null)} />,
          popupNode,
        )
        : null}
    </div>
  );
}
