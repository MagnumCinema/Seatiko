"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import {
  fetchMapConfig,
  fetchMapPlaces,
  pickLocale,
  priceLevelLabel,
  type LocaleCode,
  type MapConfig,
  type MapBounds,
  type MapCoordinates,
  type MapPlace,
  type MapPlacesResponse,
} from "@/lib/api";
import {
  encodePreferences,
  filterAndRankPlaces,
  formatBudgetAmount,
  relaxPreference,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { venueHoursLabel } from "@/lib/venue-hours";
import { useCurrency } from "@/components/currency-provider";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import { venueBookingHref } from "@/lib/booking-link";
import { googleMapDirections, googleMapSearch } from "@/lib/google-map";
import { useTheme } from "@/components/theme-provider";
import { applyMapLibreLocalization, getMapLibreLocale } from "@/lib/maplibre-locale";
import { GoogleVenueMap } from "@/components/google-venue-map";

type MapState = "loading" | "ready" | "error";
type PlacePointProperties = {
  placeId: string;
  venueId: string;
  inDatabase: boolean;
  name: string;
  selected: boolean;
};

const DEFAULT_CITY = "city-balti";
const BALTI_BOUNDS: MapBounds = { south: 47.70, west: 27.84, north: 47.82, east: 28.02 };
const MOLDOVA_BOUNDS: MapBounds = { south: 45.45, west: 26.60, north: 48.55, east: 30.20 };
const OPEN_FREE_MAP_STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;
const SOURCE_ID = "seatiko-venues";
const VENUE_LAYER_ID = "seatiko-venue-pins";
const DOT_LAYER_ID = "seatiko-venue-dots";
/** Below this zoom (whole city) places are dots, so they don't pile up; closer they become pins. */
const PIN_MIN_ZOOM = 14;
/** Site palette: partners deep green, other places sage, the selected one gold (lighter greens on dark tiles). */
const PIN_THEME_COLORS = {
  light: { partner: "#175f43", other: "#7fa792", selected: "#d99a3e" },
  dark: { partner: "#3aa877", other: "#8fae9d", selected: "#e9b96e" },
} as const;
/** Place names drawn on the map: dark on the light tiles, light on the dark ones. */
const NAME_COLORS = {
  light: { text: "#183e31", halo: "rgba(255, 253, 248, 0.97)" },
  dark: { text: "#f3ead9", halo: "rgba(12, 22, 18, 0.92)" },
} as const;

/** Search for an open-data place by name and address (it has no Google place id). */
function placeSearchUrl(place: MapPlace, locale: LocaleCode) {
  return googleMapSearch([pickLocale(place.name, locale), pickLocale(place.address, locale)].filter(Boolean).join(", "), place.google_place_id);
}

/** Map strings live in site-copy (RU/EN/RO). */
function mapText(locale: LocaleCode) {
  return getSiteCopy(locale).venueMap;
}

function formatFreeTablesLabel(locale: LocaleCode, count: number): string {
  const forms = mapText(locale).freeTables;
  const rule = new Intl.PluralRules(locale).select(count);
  return rule === "one" || rule === "few" || rule === "many" ? forms[rule] : forms.other;
}

const RECOMMENDED_LIST_COUNT = 3;

function getVenueHours(place: MapPlace, locale: LocaleCode): string {
  if (place.venue_id) {
    // The owner's own hours from the API; the bundled demo hours only when none are set.
    return venueHoursLabel({ id: place.venue_id, hours_text: place.hours_text }, locale);
  }
  // Open-data places: only what OpenStreetMap knows, never a made-up default.
  return place.opening_hours ?? "";
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

/** Draws a map pin (teardrop with a white dot) once per map, at 2× for sharp screens. */
function addPinImage(map: maplibregl.Map, id: string, color: string) {
  if (map.hasImage(id)) return;
  const ratio = 2;
  const w = 26;
  const h = 34;
  const canvas = document.createElement("canvas");
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const cx = w / 2;
  const r = 11;
  const cy = r + 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, h - 1);
  ctx.bezierCurveTo(cx - 2, h - 8, cx - r, cy + 7, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(cx + r, cy + 7, cx + 2, h - 8, cx, h - 1);
  ctx.closePath();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio });
}

function placeCollection(
  places: MapPlace[],
  locale: LocaleCode,
  selectedId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, PlacePointProperties> {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      id: place.id,
      geometry: {
        type: "Point",
        coordinates: [place.lng, place.lat],
      },
      properties: {
        placeId: place.id,
        venueId: place.venue_id ?? "",
        inDatabase: place.in_database,
        name: pickLocale(place.name, locale),
        selected: place.id === selectedId,
      },
    })),
  };
}

type VenueMapProps = { compact?: boolean; preferences?: DiscoverPreferences };

export function VenueMap(props: VenueMapProps) {
  const { locale } = useLocale();
  const [config, setConfig] = useState<MapConfig | null | undefined>();
  const [cityId, setCityId] = useState(DEFAULT_CITY);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [bookableOnly, setBookableOnly] = useState(false);
  useEffect(() => {
    let active = true;
    fetchMapConfig()
      .then((result) => { if (active) setConfig(result); })
      .catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, []);

  const labels = mapText(locale);
  const cities = (config?.cities ?? []).filter((city) => city.country === "MD" && city.bounds);
  const city = cities.find((item) => item.id === cityId);
  const name = cityId === "all" ? labels.countryName : city ? pickLocale(city.name, locale) : labels.defaultCity;
  const bounds = cityId === "all"
    ? config?.country_bounds ?? MOLDOVA_BOUNDS
    : city?.bounds ?? BALTI_BOUNDS;
  // Cities the API marks available:false have no venues yet: shown as "Скоро".
  const comingSoon = Boolean(city && !city.available);
  const externalUrl = googleMapSearch(`${searchText.trim() || labels.food} ${name}`);

  return (
    <div>
      <form
        className="venue-map-areas"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(searchText.trim());
        }}
      >
        <label className="venue-map-area-field">
          <span className="venue-map-area-label">{labels.area}</span>
          <span className="venue-map-select-wrap">
            <SelectMenu
              buttonClassName="venue-map-select-trigger"
              value={cityId}
              onChange={setCityId}
              options={[
                ...(!cities.some((item) => item.id === DEFAULT_CITY)
                  ? [{ value: DEFAULT_CITY, label: labels.defaultCity }]
                  : []),
                ...cities.map((item) => ({
                  value: item.id,
                  label: pickLocale(item.name, locale),
                  badge: item.available ? undefined : labels.soon,
                })),
                { value: "all", label: labels.country },
              ]}
            />
          </span>
        </label>
        <div className="venue-map-search">
          <span className="venue-map-search-field">
            <input
              type="search"
              aria-label={labels.query}
              placeholder={labels.query}
              value={searchText}
              maxLength={100}
              onChange={(event) => {
                const value = event.target.value;
                setSearchText(value);
                if (!value.trim()) setQuery("");
              }}
            />
            {searchText ? (
              <button
                type="button"
                className="venue-map-search-clear"
                aria-label={labels.clearSearch}
                title={labels.clearSearch}
                onClick={() => {
                  setSearchText("");
                  setQuery("");
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </span>
          <button type="submit" className="venue-map-search-submit">{labels.find}</button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={bookableOnly}
          className={`venue-map-bookable${bookableOnly ? " is-on" : ""}`}
          onClick={() => setBookableOnly((value) => !value)}
        >
          <span className="venue-map-switch" aria-hidden="true"><i /></span>
          <span>{labels.bookableOnly}</span>
        </button>
        <a
          className="venue-map-external"
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {labels.openExternal} <span aria-hidden="true">↗</span>
        </a>
      </form>
      {config === undefined ? (
        <div className="venue-map-canvas" role="status">
          <div className="live-map-loading"><span /><p>{labels.loadingMap}</p></div>
        </div>
      ) : (
        <VenueMapArea
          key={cityId}
          {...props}
          cityId={cityId}
          bounds={bounds}
          config={config}
          externalUrl={externalUrl}
          query={query}
          bookableOnly={bookableOnly}
          comingSoon={comingSoon}
          onShowDefaultCity={() => setCityId(DEFAULT_CITY)}
        />
      )}
    </div>
  );
}

function VenueMapArea({
  compact = false, preferences, cityId, bounds, config, externalUrl, query, bookableOnly, comingSoon, onShowDefaultCity,
}: VenueMapProps & {
  cityId: string;
  bounds: MapBounds;
  config: MapConfig | null;
  externalUrl: string;
  query: string;
  bookableOnly: boolean;
  comingSoon: boolean;
  onShowDefaultCity: () => void;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const { currency } = useCurrency();
  const { theme } = useTheme();
  const copy = mapText(locale);
  const labels = copy;
  const siteCopy = getSiteCopy(locale);
  const discoverCopy = siteCopy.discover;
  const currencyLabel = siteCopy.discover.budgetCurrencies[currency];
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const placesRef = useRef<MapPlace[]>([]);
  const localeRef = useRef(locale);
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [nearbyDenied, setNearbyDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  /** The MapLibre map whose style has loaded; a theme switch rebuilds the map and the layers follow. */
  const [loadedMap, setLoadedMap] = useState<maplibregl.Map | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [viewport, setViewport] = useState<MapBounds>();
  const [focus, setFocus] = useState<MapCoordinates | null>(null);
  const [retry, setRetry] = useState(0);
  const googleKey = config?.google_maps_key;
  const useGoogle = Boolean(googleKey) && !googleFailed;
  // Without a Google key the API still adds open-data places (OpenStreetMap, Overture).
  const includeGoogle = (useGoogle ? googleReady : true) && !bookableOnly;
  const validViewport = useGoogle && viewport &&
    viewport.south < viewport.north && viewport.west < viewport.east ? viewport : undefined;
  const filters = preferences ? encodePreferences(preferences) : "";
  const near = preferences?.practical.includes("nearby") ? userGeo : null;
  const request = useMemo(
    () => ({ cityId, includeGoogle, locale, bounds: validViewport, query, bookableOnly, filters, near, retry }),
    [cityId, includeGoogle, locale, validViewport, query, bookableOnly, filters, near, retry],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    data: MapPlacesResponse | null;
  }>();
  const loading = result?.request !== request;
  const data = loading ? undefined : result.data;
  const loadError = data === null;
  const googleStatus = data?.source.google_status;

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
    setViewport({
      south: Math.max(next.south, bounds.south), west: Math.max(next.west, bounds.west),
      north: Math.min(next.north, bounds.north), east: Math.min(next.east, bounds.east),
    });
  }, [bounds]);

  const ranked = useMemo(() => {
    const visible = data?.places ?? [];
    if (!preferences) return visible.map((place) => ({ place, score: 0 }));
    return filterAndRankPlaces(visible, preferences, {
      userLat: userGeo?.lat,
      userLng: userGeo?.lng,
    });
  }, [data, preferences, userGeo]);

  const places = useMemo(() => ranked.map((r) => r.place), [ranked]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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

  function showVenuePopup(place: MapPlace, map: maplibregl.Map) {
    const labels = mapText(localeRef.current);
    const name = pickLocale(place.name, localeRef.current);
    const venueId = place.in_database ? place.venue_id : undefined;
    const hours = getVenueHours(place, localeRef.current);

    const root = document.createElement("div");
    root.className = "venue-map-popup-card";

    // Header: title + rating
    const head = document.createElement("div");
    head.className = "venue-map-popup-head";

    const title = document.createElement("strong");
    title.textContent = name;
    head.appendChild(title);

    if (typeof place.rating === "number") {
      const rating = document.createElement("span");
      rating.className = "venue-map-popup-rating";
      rating.textContent = `★ ${place.rating.toFixed(1)}`;
      head.appendChild(rating);
    }
    root.appendChild(head);

    // Schedule & open status row (open-data places: hours only, when known)
    const schedule = document.createElement("div");
    schedule.className = "venue-map-popup-schedule";

    if (venueId) {
      const dot = document.createElement("span");
      dot.className = `status-dot ${place.open_now ? "open" : "closed"}`;
      schedule.appendChild(dot);

      const status = document.createElement("span");
      status.className = "popup-status-text";
      status.textContent = place.open_now ? labels.open : labels.closed;
      schedule.appendChild(status);
    }

    if (hours) {
      const hoursSpan = document.createElement("span");
      hoursSpan.className = "popup-hours-text";
      hoursSpan.textContent = venueId ? `· ${hours}` : hours;
      schedule.appendChild(hoursSpan);
    }

    if (schedule.childElementCount > 0) root.appendChild(schedule);

    const addLink = (parent: HTMLElement, href: string, text: string, className: string, external = false) => {
      const link = document.createElement("a");
      link.href = href;
      link.className = className;
      link.textContent = text;
      if (external) {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      parent.appendChild(link);
    };

    if (venueId) {
      if (place.bookable && typeof place.free_tables === "number") {
        const free = document.createElement("div");
        free.className = "venue-map-popup-free";

        const freeDot = document.createElement("span");
        freeDot.className = "popup-free-dot";
        free.appendChild(freeDot);

        const freeCount = document.createElement("b");
        freeCount.textContent = String(place.free_tables);
        free.appendChild(freeCount);

        const freeText = document.createElement("span");
        freeText.textContent = ` ${formatFreeTablesLabel(localeRef.current, place.free_tables)}`;
        free.appendChild(freeText);

        root.appendChild(free);
      } else if (!place.bookable) {
        const note = document.createElement("div");
        note.className = "venue-map-popup-note";
        note.textContent = labels.notBookableNote;
        root.appendChild(note);
      }

      const actions = document.createElement("div");
      actions.className = "venue-map-popup-actions";
      if (place.bookable) addLink(actions, venueBookingHref(venueId), labels.popupBook, "primary");
      addLink(actions, `/venues/${encodeURIComponent(venueId)}`, labels.openPage, place.bookable ? "secondary" : "primary");
      root.appendChild(actions);
    } else {
      const address = pickLocale(place.address, localeRef.current);
      if (address) {
        const addressRow = document.createElement("div");
        addressRow.className = "venue-map-popup-address";
        addressRow.textContent = address;
        root.appendChild(addressRow);
      }

      const badge = document.createElement("div");
      badge.className = "venue-map-popup-opendata";
      badge.textContent = labels.openData;
      root.appendChild(badge);

      const note = document.createElement("div");
      note.className = "venue-map-popup-note";
      note.textContent = labels.openDataNote;
      root.appendChild(note);

      // Open-data places always get a way to go there, plus a call when the phone is known.
      const actions = document.createElement("div");
      actions.className = "venue-map-popup-actions";
      addLink(actions, googleMapDirections(place), labels.route, "primary", true);
      if (place.phone) {
        addLink(actions, `tel:${place.phone.replace(/[^+\d]/g, "")}`, labels.callVenue, "secondary");
      } else {
        addLink(actions, placeSearchUrl(place, localeRef.current), labels.findInMaps, "secondary", true);
      }
      root.appendChild(actions);
    }

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({
      offset: 18,
      closeButton: true,
      maxWidth: "300px",
      className: "venue-map-popup",
      anchor: "bottom",
    })
      .setLngLat([place.lng, place.lat])
      .setDOMContent(root)
      .addTo(map);
  }

  useEffect(() => {
    const controller = new AbortController();
    popupRef.current?.remove();
    fetchMapPlaces(request.cityId, { ...request, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const sorted = sortPlaces(data.places ?? [], Boolean(request.query));
        setResult({ request, data: { ...data, places: sorted } });
        setSelectedId((previous) => sorted.some((place) => place.id === previous) ? previous : sorted[0]?.id ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ request, data: null }); });
    return () => controller.abort();
  }, [request]);

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

    if (!compact) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }
    // Bottom right, as on Google Maps: credits strip, zoom +/−, then "my location" above.
    map.addControl(
      // ODbL: OpenStreetMap data (tiles and places) must be credited; folded into an (i) button.
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Places: © OpenStreetMap contributors, Overture Maps Foundation" }),
      "bottom-right",
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.once("load", () => {
      // Start with the credits folded; the (i) button opens them.
      map.getContainer().querySelectorAll(".maplibregl-compact-show").forEach((el) => el.classList.remove("maplibregl-compact-show"));
      applyMapLibreLocalization(map, localeRef.current);
      setMapState("ready");
      setLoadedMap(map);
    });
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // A theme switch rebuilds the map on the matching (light or dark) tiles.
  }, [bounds, compact, useGoogle, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || map !== loadedMap) return;
    applyMapLibreLocalization(map, locale);
    const effectiveSelectedId =
      places.find((place) => place.id === selectedId)?.id ?? places[0]?.id ?? null;
    const data = placeCollection(places, locale, effectiveSelectedId);
    const PIN_COLORS = PIN_THEME_COLORS[theme];
    const existingSource = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(data);
    } else {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data,
      });

      // City view: small dots. Zoomed in: location pins (teardrops).
      const sortKey = ["case", ["boolean", ["get", "selected"], false], 2, ["boolean", ["get", "inDatabase"], false], 1, 0];
      map.addLayer({
        id: DOT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        maxzoom: PIN_MIN_ZOOM,
        layout: { "circle-sort-key": sortKey as maplibregl.ExpressionSpecification },
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["get", "selected"], false],
            PIN_COLORS.selected,
            ["boolean", ["get", "inDatabase"], false],
            PIN_COLORS.partner,
            PIN_COLORS.other,
          ],
          "circle-radius": ["case", ["boolean", ["get", "selected"], false], 8, ["boolean", ["get", "inDatabase"], false], 6.5, 5],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fffdf8",
        },
      });
      addPinImage(map, "seatiko-pin-partner", PIN_COLORS.partner);
      addPinImage(map, "seatiko-pin-other", PIN_COLORS.other);
      addPinImage(map, "seatiko-pin-selected", PIN_COLORS.selected);
      map.addLayer({
        id: VENUE_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        minzoom: PIN_MIN_ZOOM,
        layout: {
          "icon-image": [
            "case",
            ["boolean", ["get", "selected"], false],
            "seatiko-pin-selected",
            ["boolean", ["get", "inDatabase"], false],
            "seatiko-pin-partner",
            "seatiko-pin-other",
          ],
          "icon-size": ["case", ["boolean", ["get", "selected"], false], 1.25, 1],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // Partners and the selected place are drawn above the other pins.
          "symbol-sort-key": sortKey as maplibregl.ExpressionSpecification,
        },
      });
      map.addLayer({
        id: "seatiko-venue-name",
        type: "symbol",
        source: SOURCE_ID,
        minzoom: PIN_MIN_ZOOM,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, 0.3],
          "text-anchor": "top",
          "text-optional": true,
          "text-padding": 5,
          "text-max-width": 12,
        },
        paint: {
          "text-color": NAME_COLORS[theme].text,
          "text-halo-color": NAME_COLORS[theme].halo,
          "text-halo-width": 2,
          "text-halo-blur": 0.4,
        },
      });

      const onPlaceClick = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const placeId = String(feature?.properties?.placeId ?? "");
        const place = placesRef.current.find((item) => item.id === placeId);
        if (!place) return;
        setSelectedId(place.id);
        map.easeTo({ center: [place.lng, place.lat], zoom: 15.2, duration: 520 });
        showVenuePopup(place, map);
      };
      map.on("click", VENUE_LAYER_ID, onPlaceClick);
      map.on("click", DOT_LAYER_ID, onPlaceClick);
      [VENUE_LAYER_ID, DOT_LAYER_ID].forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    }

  }, [locale, mapState, loadedMap, selectedId, places, theme]);

  const selected = useMemo(
    () => places.find((place) => place.id === selectedId) ?? places[0],
    [selectedId, places],
  );

  function selectPlace(place: MapPlace) {
    setSelectedId(place.id);
    if (useGoogle) setFocus({ lat: place.lat, lng: place.lng });
    const map = mapRef.current;
    map?.easeTo({
      center: [place.lng, place.lat],
      zoom: 15.2,
      duration: 520,
    });
    popupRef.current?.remove();
  }

  const selectedVenueId = selected?.in_database ? selected.venue_id : undefined;
  const selectedBookable = Boolean(selected?.bookable && selectedVenueId);
  const emptyMessage = preferences && (data?.places.length || (!query && !bookableOnly))
    ? discoverCopy.filtersEmpty
    : query ? labels.noMatches
      : bookableOnly ? labels.noBookable : copy.empty;
  const hasMeta =
    !!selected &&
    ((selected.cuisine && selected.cuisine.length > 0) ||
      typeof selected.price_level === "number" ||
      typeof selected.average_check === "number");

  const visiblePlaces = compact ? places.slice(0, 4) : places;
  const recommendCount = preferences
    ? Math.min(RECOMMENDED_LIST_COUNT, visiblePlaces.length)
    : 0;
  const recommendedPlaces = visiblePlaces.slice(0, recommendCount);
  const otherPlaces = visiblePlaces.slice(recommendCount);
  const showPartnerHeading =
    recommendedPlaces.length > 0 && otherPlaces.length > 0;

  function renderListItem(
    place: MapPlace,
    index: number,
    recommendedRow: boolean,
  ) {
    const isSelected = place.id === selected?.id;
    return (
      <button
        type="button"
        key={place.id}
        aria-pressed={isSelected}
        className={[
          "venue-map-item",
          isSelected ? "active" : "",
          recommendedRow ? "is-recommended" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => selectPlace(place)}
      >
        <b aria-hidden="true" className={`venue-num venue-dot ${place.in_database ? "is-partner" : ""} ${isSelected ? "active" : ""}`} />
        <span className="venue-name">{pickLocale(place.name, locale)}</span>
        {place.in_database && place.bookable && place.venue_id ? (
          // Short "9 своб." so the venue name keeps the room; the full label is for screen readers.
          <small
            className="venue-status-pill"
            title={`${place.free_tables ?? 0} ${formatFreeTablesLabel(locale, place.free_tables ?? 0)}`}
          >
            <span className={`status-dot ${place.open_now ? "open" : "closed"}`} />
            <span aria-hidden="true">{place.free_tables ?? 0} {copy.freeShort}</span>
            <span className="sr-only">{place.free_tables ?? 0} {formatFreeTablesLabel(locale, place.free_tables ?? 0)}</span>
          </small>
        ) : place.in_database ? (
          <small className="venue-status-pill">{labels.partner}</small>
        ) : typeof place.rating === "number" ? (
          <small className="venue-status-pill">★ {place.rating.toFixed(1)}</small>
        ) : (
          <small className="venue-status-pill is-open-data">{copy.openData}</small>
        )}
      </button>
    );
  }

  return (
    <div className={`venue-map-shell ${compact ? "compact" : ""}`}>
      <div
        className={`venue-map-canvas live-map-canvas${useGoogle ? " is-google" : ""}`}
        aria-label={copy.aria}
      >
        {useGoogle && googleKey ? (
          <GoogleVenueMap
            apiKey={googleKey} mapId={config?.google_maps_id ?? ""} bounds={bounds}
            places={places} locale={locale} focus={focus} compact={compact} searchLabel={labels.search}
            onReady={googleLoaded} onError={useFallback} onSelect={setSelectedId} onSearch={searchArea}
          />
        ) : (
          <div ref={mapNodeRef} className="live-map-surface" />
        )}
        {mapState === "error" && (
          <div className="live-map-fallback" role="status">
            <div className="live-map-fallback-card">
              <div><strong>{copy.unavailable}</strong><p>{copy.unavailableBody}</p>
                <a href={externalUrl} target="_blank" rel="noreferrer">{copy.openExternal} ↗</a>
              </div>
            </div>
          </div>
        )}
        {mapState === "loading" && (
          <div className="live-map-loading">
            <span />
            <p>{copy.loadingMap}</p>
          </div>
        )}
        {mapState === "ready" && (
          <>
            <div className="live-map-status">
              {comingSoon ? (
                <span className="is-soon">{copy.soonTitle}</span>
              ) : !loading && places.length === 0 ? (
                <span className="is-empty">{copy.emptyArea}</span>
              ) : (
                <span>
                  <i /> {loading ? copy.loadingVenues : `${places.length} ${copy.online}`}
                </span>
              )}
              {!loading && preferences && data?.filters ? (
                <span className="live-map-found" role="status">
                  {t("map.found", { matched: data.filters.matched, total: data.filters.total })}
                </span>
              ) : null}
              {!useGoogle && !comingSoon && places.length > 0 && <small>{copy.updated}</small>}
            </div>
            {places.length > 0 && <div className="venue-map-legend" aria-label={copy.legendAria}>
              <span><i className="legend-dot legend-dot-ours" /> {copy.legendOurs}</span>
              {!bookableOnly && places.some((place) => !place.in_database) && <span><i className="legend-dot legend-dot-other" /> {copy.legendOther}</span>}
            </div>}
          </>
        )}
      </div>

      <div className="venue-map-panel" aria-busy={loading}>
        {loadError && (
          <p role="status" className="venue-map-address">
            {labels.loadError}{" "}<button type="button" className="live-map-relax" onClick={() => setRetry((attempt) => attempt + 1)}>{labels.retry}</button>
          </p>
        )}
        {useGoogle && (googleStatus === "unavailable" || googleStatus === "disabled") && <p role="status" className="venue-map-address">{labels.providerError}</p>}
        {comingSoon && !loading && places.length === 0 ? (
          <div className="venue-map-soon" role="status">
            <span className="venue-map-soon-badge">{copy.soon}</span>
            <strong>{copy.soonTitle}</strong>
            <p>{copy.soonBody}</p>
            <button type="button" className="map-primary-action" onClick={onShowDefaultCity}>
              {copy.soonAction} <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}
        {visiblePlaces.length > 0 && <div className="venue-map-list" aria-label={copy.cityVenues}>
          {recommendedPlaces.length > 0 ? (
            <>
              <div className="venue-map-list-heading" role="presentation">
                {discoverCopy.recommended}
              </div>
              {recommendedPlaces.map((place, index) =>
                renderListItem(place, index, true),
              )}
            </>
          ) : null}
          {otherPlaces.length > 0 ? (
            <>
              {showPartnerHeading ? (
                <div
                  className="venue-map-list-heading is-more"
                  role="presentation"
                >
                  {copy.listPartners}
                </div>
              ) : null}
              {otherPlaces.map((place, index) =>
                renderListItem(place, recommendCount + index, false),
              )}
            </>
          ) : null}
        </div>}

        {selected ? (
          <div className="venue-card-details">
            <div className="venue-card-header">
              <div>
                <span className="eyebrow">{copy.nearby}</span>
                <h3>{pickLocale(selected.name, locale)}</h3>
              </div>
              <div className="venue-card-badges">
                {selectedBookable ? (
                  <span className="venue-bookable-badge">{copy.bookableBadge}</span>
                ) : selectedVenueId ? (
                  <span className="venue-bookable-badge is-off">{copy.notBookableBadge}</span>
                ) : (
                  <span className="venue-bookable-badge is-open-data">{copy.openData}</span>
                )}
                {typeof selected.rating === "number" && (
                  <span className="venue-rating">★ {selected.rating.toFixed(1)}</span>
                )}
              </div>
            </div>

            <p className="venue-card-address">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{pickLocale(selected.address, locale)}</span>
            </p>

            {hasMeta && (
              <div className="venue-map-meta">
                {selected.cuisine && selected.cuisine.length > 0 && (
                  <span>
                    {selected.cuisine
                      .slice(0, 2)
                      .map((item) => siteCopy.catalog.cuisines[item as keyof typeof siteCopy.catalog.cuisines] ?? item)
                      .join(" · ")}
                  </span>
                )}
                {typeof selected.price_level === "number" && (
                  <span>{priceLevelLabel(selected.price_level)}</span>
                )}
                {typeof selected.average_check === "number" && (
                  <span>
                    ~{formatBudgetAmount(selected.average_check, currency)}{" "}
                    {currencyLabel}
                  </span>
                )}
              </div>
            )}

            {selectedVenueId ? (
              <div className={`venue-availability ${selected.open_now ? "is-open" : "is-closed"}`}>
                <div className="venue-availability-status">
                  <span className="venue-status-indicator">
                    <i /> {selected.open_now ? copy.open : copy.closed}
                  </span>
                  <span className="venue-hours-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {getVenueHours(selected, locale)}
                  </span>
                </div>
                {selectedBookable ? (
                  <strong>{selected.free_tables ?? 0} {formatFreeTablesLabel(locale, selected.free_tables ?? 0)}</strong>
                ) : (
                  <p className="venue-availability-note">{copy.notBookableNote}</p>
                )}
              </div>
            ) : null}

            {!selected.in_database ? (
              <>
                {selected.opening_hours || selected.phone ? (
                  <div className="venue-map-meta">
                    {selected.opening_hours && <span>{selected.opening_hours}</span>}
                    {selected.phone && <a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a>}
                  </div>
                ) : null}
                <p className="venue-open-data-note">{copy.openDataNote}</p>
              </>
            ) : null}

            <div className="venue-card-footer">
              {!selected.in_database && (
                <div className="venue-map-actions">
                  <a
                    className="map-primary-action"
                    href={googleMapDirections(selected)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.route} <span aria-hidden="true">↗</span>
                  </a>
                  <a
                    className="map-secondary-action"
                    href={placeSearchUrl(selected, locale)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.findInMaps}
                  </a>
                </div>
              )}
              {selected.in_database && selected.google_place_id && (
                <a
                  className="venue-map-website"
                  href={googleMapSearch(pickLocale(selected.name, locale), selected.google_place_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{copy.openExternal}</span> <span aria-hidden="true">↗</span>
                </a>
              )}
              {selected.website && (
                <a
                  className="venue-map-website"
                  href={selected.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  <span>{copy.websiteLabel}</span>
                </a>
              )}

              {selectedVenueId && (
                <div className="venue-map-actions">
                  {selectedBookable && (
                    <Link href={venueBookingHref(selectedVenueId)} className="map-primary-action">
                      {copy.action} <span>→</span>
                    </Link>
                  )}
                  <Link
                    href={`/venues/${encodeURIComponent(selectedVenueId)}`}
                    className="map-secondary-action"
                  >
                    {copy.openPage}
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : !loadError && !(comingSoon && !loading) ? (
          <p className="venue-map-address" role="status">
            {loading ? copy.loadingVenues : emptyMessage}
            {!loading && preferences && data?.filters?.relax ? (
              <>
                {" "}
                <button
                  type="button"
                  className="live-map-relax"
                  onClick={() => {
                    const next = encodePreferences(relaxPreference(preferences, data.filters!.relax!.filter));
                    router.replace(next ? `/?${next}#map` : "/#map", { scroll: false });
                  }}
                >
                  {t("map.relax", {
                    filter:
                      data.filters.relax.filter === "cuisine" || data.filters.relax.filter === "budget"
                        ? discoverCopy.steps[data.filters.relax.filter]
                        : (discoverCopy.chips[data.filters.relax.filter as keyof typeof discoverCopy.chips] ?? data.filters.relax.filter),
                    count: data.filters.relax.matched,
                  })}
                </button>
              </>
            ) : null}
          </p>
        ) : null}

        {nearbyDenied && (
          <p className="venue-map-address" role="status">
            {discoverCopy.nearbyDenied}
          </p>
        )}
      </div>
    </div>
  );
}
