"use client";

import Link from "next/link";
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
} from "@/lib/api";
import {
  filterAndRankPlaces,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { getVenueHours as getVenueHoursById } from "@/lib/venue-hours";
import { useLocale } from "@/components/locale-provider";
import { venueBookingHref } from "@/lib/booking-link";
import { googleMapSearch } from "@/lib/google-map";
import { GoogleVenueMap } from "@/components/google-venue-map";

type MapState = "loading" | "ready" | "error";
type PlacePointProperties = {
  placeId: string;
  venueId: string;
  inDatabase: boolean;
  index: string;
  name: string;
  selected: boolean;
};

const DEFAULT_CITY = "city-balti";
const BALTI_BOUNDS: MapBounds = { south: 47.70, west: 27.84, north: 47.82, east: 28.02 };
const MOLDOVA_BOUNDS: MapBounds = { south: 45.45, west: 26.60, north: 48.55, east: 30.20 };
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "seatiko-venues";
const CLUSTER_LAYER_ID = "seatiko-clusters";
const VENUE_LAYER_ID = "seatiko-venue-pins";

const mapCopy = {
  ru: {
    unavailable: "Карта временно недоступна",
    unavailableBody: "Рестораны и свободные столы остаются доступными в списке справа.",
    openExternal: "Открыть поиск в Google Maps",
    online: "заведений онлайн",
    aria: "Интерактивная карта ресторанов",
    loadingMap: "Загружаем карту…",
    loadingVenues: "Загружаем заведения",
    updated: "OpenStreetMap · обновляется автоматически",
    nearby: "Выбрано на карте",
    cityVenues: "Рестораны на карте",
    open: "Открыто сейчас",
    closed: "Сейчас закрыто",
    free: "свободных столов",
    tables: "столов",
    empty: "После публикации рестораны автоматически появятся здесь.",
    action: "Забронировать стол",
    openPage: "Страница ресторана",
    popupFree: "свободно",
    popupBook: "Забронировать",
    legendAria: "Легенда карты",
    legendOurs: "В Seatiko — можно забронировать",
    legendOther: "Другие заведения",
    comingSoon: "Google Maps",
    bookableBadge: "Можно забронировать"
  },
  en: {
    unavailable: "Map temporarily unavailable",
    unavailableBody: "Restaurants and available tables are still listed on the right.",
    openExternal: "Open search in Google Maps",
    online: "venues online",
    aria: "Interactive restaurant map",
    loadingMap: "Loading map…",
    loadingVenues: "Loading venues",
    updated: "OpenStreetMap · updates automatically",
    nearby: "Selected on map",
    cityVenues: "Restaurants on the map",
    open: "Open now",
    closed: "Closed now",
    free: "tables available",
    tables: "tables",
    empty: "Restaurants appear here automatically after publication.",
    action: "Book a table",
    openPage: "Restaurant page",
    popupFree: "free",
    popupBook: "Book",
    legendAria: "Map legend",
    legendOurs: "In Seatiko — bookable",
    legendOther: "Other places",
    comingSoon: "Google Maps",
    bookableBadge: "Bookable"
  },
  ro: {
    unavailable: "Harta este temporar indisponibilă",
    unavailableBody: "Restaurantele și mesele libere rămân disponibile în lista din dreapta.",
    openExternal: "Deschide căutarea în Google Maps",
    online: "localuri online",
    aria: "Harta interactivă a restaurantelor",
    loadingMap: "Se încarcă harta…",
    loadingVenues: "Se încarcă localurile",
    updated: "OpenStreetMap · se actualizează automat",
    nearby: "Selectat pe hartă",
    cityVenues: "Restaurante pe hartă",
    open: "Deschis acum",
    closed: "Închis acum",
    free: "mese libere",
    tables: "mese",
    empty: "Restaurantele apar automat aici după publicare.",
    action: "Rezervă o masă",
    openPage: "Pagina restaurantului",
    popupFree: "libere",
    popupBook: "Rezervă",
    legendAria: "Legenda hărții",
    legendOurs: "În Seatiko — se poate rezerva",
    legendOther: "Alte localuri",
    comingSoon: "Google Maps",
    bookableBadge: "Se poate rezerva"
  },
} as const;

function getVenueHours(place: MapPlace, locale: LocaleCode): string {
  if (place.venue_id) {
    return getVenueHoursById(place.venue_id, locale);
  }
  return getVenueHoursById("", locale);
}

function sortPlaces(places: MapPlace[]): MapPlace[] {
  return [...places].sort((a, b) => {
    if (a.in_database !== b.in_database) return a.in_database ? -1 : 1;
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
  const nameA = a.name.en || a.name.ru || a.name.ro || "";
  const nameB = b.name.en || b.name.ru || b.name.ro || "";
    return nameA.localeCompare(nameB);
  });
}

function placeCollection(
  places: MapPlace[],
  locale: LocaleCode,
  selectedId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, PlacePointProperties> {
  return {
    type: "FeatureCollection",
    features: places.map((place, index) => ({
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
        index: String(index + 1),
        name: pickLocale(place.name, locale),
        selected: place.id === selectedId,
      },
    })),
  };
}

const areaCopy = {
  ru: { country: "Вся Молдова", countryName: "Молдова", area: "Город или страна", search: "Поиск в этой области", food: "Рестораны", providerError: "Поиск Google Places недоступен", loadError: "Не удалось загрузить заведения", retry: "Повторить" },
  en: { country: "All Moldova", countryName: "Moldova", area: "City or country", search: "Search this area", food: "Restaurants", providerError: "Google Places search is unavailable", loadError: "Could not load venues", retry: "Retry" },
  ro: { country: "Toată Moldova", countryName: "Moldova", area: "Oraș sau țară", search: "Caută în această zonă", food: "Restaurante", providerError: "Căutarea Google Places nu este disponibilă", loadError: "Localurile nu au putut fi încărcate", retry: "Încearcă din nou" },
};

type VenueMapProps = { compact?: boolean; preferences?: DiscoverPreferences };

export function VenueMap(props: VenueMapProps) {
  const { locale } = useLocale();
  const [config, setConfig] = useState<MapConfig | null | undefined>();
  const [cityId, setCityId] = useState(DEFAULT_CITY);
  useEffect(() => {
    let active = true;
    fetchMapConfig()
      .then((result) => { if (active) setConfig(result); })
      .catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, []);

  const labels = areaCopy[locale];
  const cities = (config?.cities ?? []).filter((city) => city.country === "MD" && city.bounds);
  const city = cities.find((item) => item.id === cityId);
  const name = cityId === "all" ? labels.countryName : city ? pickLocale(city.name, locale) : "Bălți";
  const bounds = cityId === "all"
    ? config?.country_bounds ?? MOLDOVA_BOUNDS
    : city?.bounds ?? BALTI_BOUNDS;
  const externalUrl = googleMapSearch(`${labels.food} ${name}`);

  return (
    <div>
      <div className="venue-map-areas">
        <label>
          {labels.area}
          <select value={cityId} onChange={(event) => setCityId(event.target.value)}>
            {!cities.some((item) => item.id === DEFAULT_CITY) && <option value={DEFAULT_CITY}>Bălți</option>}
            {cities.map((item) => <option key={item.id} value={item.id}>{pickLocale(item.name, locale)}</option>)}
            <option value="all">{labels.country}</option>
          </select>
        </label>
        <a href={externalUrl} target="_blank" rel="noreferrer">{mapCopy[locale].openExternal} ↗</a>
      </div>
      {config === undefined ? (
        <div className="venue-map-canvas" role="status">
          <div className="live-map-loading"><span /><p>{mapCopy[locale].loadingMap}</p></div>
        </div>
      ) : (
        <VenueMapArea key={cityId} {...props} cityId={cityId} bounds={bounds} config={config} externalUrl={externalUrl} />
      )}
    </div>
  );
}

function VenueMapArea({
  compact = false, preferences, cityId, bounds, config, externalUrl,
}: VenueMapProps & { cityId: string; bounds: MapBounds; config: MapConfig | null; externalUrl: string }) {
  const { locale } = useLocale();
  const copy = mapCopy[locale];
  const labels = areaCopy[locale];
  const discoverCopy = getSiteCopy(locale).discover;
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const placesRef = useRef<MapPlace[]>([]);
  const localeRef = useRef(locale);
  const [allPlaces, setAllPlaces] = useState<MapPlace[]>([]);
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [nearbyDenied, setNearbyDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [googleFailed, setGoogleFailed] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleStatus, setGoogleStatus] = useState("");
  const [viewport, setViewport] = useState<MapBounds>();
  const [focus, setFocus] = useState<MapCoordinates | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const googleKey = config?.google_maps_key;
  const useGoogle = Boolean(googleKey) && !googleFailed;

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
    const visible = useGoogle ? allPlaces : allPlaces.filter((place) => place.in_database);
    if (!preferences) return visible.map((place) => ({ place, score: 0 }));
    return filterAndRankPlaces(visible, preferences, {
      userLat: userGeo?.lat,
      userLng: userGeo?.lng,
    });
  }, [allPlaces, preferences, userGeo, useGoogle]);

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
    const labels = mapCopy[localeRef.current];
    const name = pickLocale(place.name, localeRef.current);
    const bookable = place.in_database && Boolean(place.venue_id);
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

    // Schedule & open status row
    const schedule = document.createElement("div");
    schedule.className = "venue-map-popup-schedule";

    const dot = document.createElement("span");
    dot.className = `status-dot ${place.open_now ? "open" : "closed"}`;
    schedule.appendChild(dot);

    const status = document.createElement("span");
    status.className = "popup-status-text";
    status.textContent = place.open_now ? labels.open : labels.closed;
    schedule.appendChild(status);

    const hoursSpan = document.createElement("span");
    hoursSpan.className = "popup-hours-text";
    hoursSpan.textContent = `· ${hours}`;
    schedule.appendChild(hoursSpan);

    root.appendChild(schedule);

    if (bookable) {
      if (typeof place.free_tables === "number") {
        const free = document.createElement("div");
        free.className = "venue-map-popup-free";

        const freeDot = document.createElement("span");
        freeDot.className = "popup-free-dot";
        free.appendChild(freeDot);

        const freeCount = document.createElement("b");
        freeCount.textContent = String(place.free_tables);
        free.appendChild(freeCount);

        const freeText = document.createElement("span");
        freeText.textContent = ` ${labels.free}`;
        free.appendChild(freeText);

        root.appendChild(free);
      }

      const actions = document.createElement("div");
      actions.className = "venue-map-popup-actions";

      const bookLink = document.createElement("a");
      bookLink.href = venueBookingHref(place.venue_id as string);
      bookLink.className = "primary";
      bookLink.textContent = labels.popupBook;
      actions.appendChild(bookLink);

      const pageLink = document.createElement("a");
      pageLink.href = `/venues/${encodeURIComponent(place.venue_id as string)}`;
      pageLink.className = "secondary";
      pageLink.textContent = labels.openPage;
      actions.appendChild(pageLink);

      root.appendChild(actions);
    } else {
      const address = document.createElement("div");
      address.className = "venue-map-popup-address";
      address.textContent = pickLocale(place.address, localeRef.current);
      root.appendChild(address);

      const comingSoon = document.createElement("div");
      comingSoon.className = "venue-map-popup-comingsoon";
      comingSoon.textContent = labels.comingSoon;
      root.appendChild(comingSoon);
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
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setLoadError(false);
      }
    });
    const validViewport = useGoogle && viewport &&
      viewport.south < viewport.north && viewport.west < viewport.east ? viewport : undefined;
    fetchMapPlaces(cityId, { includeGoogle: useGoogle && googleReady, locale, bounds: validViewport, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const sorted = sortPlaces(data.places ?? []);
        setAllPlaces(sorted);
        setSelectedId((previous) => sorted.some((place) => place.id === previous) ? previous : sorted[0]?.id ?? null);
        setGoogleStatus(data.source.google_status);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cityId, useGoogle, googleReady, locale, viewport, retry]);

  useEffect(() => {
    if (useGoogle || !mapNodeRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: OPEN_FREE_MAP_STYLE,
        bounds: [[bounds.west, bounds.south], [bounds.east, bounds.north]],
        fitBoundsOptions: { padding: 24, duration: 0 },
        minZoom: 5,
        maxZoom: 19,
        cooperativeGestures: true,
        attributionControl: false,
      });
    } catch {
      queueMicrotask(() => setMapState("error"));
      return;
    }
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    if (!compact) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.once("load", () => setMapState("ready"));
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [bounds, compact, useGoogle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    const effectiveSelectedId =
      places.find((place) => place.id === selectedId)?.id ?? places[0]?.id ?? null;
    const data = placeCollection(places, locale, effectiveSelectedId);
    const existingSource = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(data);
    } else {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 46,
      });

      map.addLayer({
        id: "seatiko-cluster-halo",
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "rgba(255, 253, 248, 0.92)",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            23,
            10,
            28,
            30,
            33,
          ],
          "circle-blur": 0.08,
        },
      });
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#173f31",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            10,
            23,
            30,
            28,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fffdf8",
          "circle-opacity": 0.96,
        },
      });
      map.addLayer({
        id: "seatiko-cluster-count",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "seatiko-venue-halo",
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "rgba(255, 253, 248, 0.94)",
          "circle-radius": [
            "case",
            ["boolean", ["get", "selected"], false],
            21,
            18,
          ],
          "circle-blur": 0.12,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(31, 80, 60, 0.08)",
        },
      });
      map.addLayer({
        id: VENUE_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["get", "selected"], false],
            "#d77b48",
            ["boolean", ["get", "inDatabase"], false],
            "#175f43",
            "#8a8f8c",
          ],
          "circle-radius": [
            "case",
            ["boolean", ["get", "selected"], false],
            16,
            13.5,
          ],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fffdf8",
          "circle-opacity": 0.98,
        },
      });
      map.addLayer({
        id: "seatiko-venue-index",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "index"],
          "text-size": 10,
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "seatiko-venue-name",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        minzoom: 13.4,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, 2.1],
          "text-anchor": "top",
          "text-optional": true,
          "text-padding": 5,
          "text-max-width": 12,
        },
        paint: {
          "text-color": "#183e31",
          "text-halo-color": "rgba(255, 253, 248, 0.97)",
          "text-halo-width": 2,
          "text-halo-blur": 0.4,
        },
      });

      map.on("click", VENUE_LAYER_ID, (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const placeId = String(feature?.properties?.placeId ?? "");
        const place = placesRef.current.find((item) => item.id === placeId);
        if (!place) return;
        setSelectedId(place.id);
        map.easeTo({ center: [place.lng, place.lat], zoom: 15.2, duration: 520 });
        showVenuePopup(place, map);
      });
      map.on("click", CLUSTER_LAYER_ID, async (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = Number(feature?.properties?.cluster_id);
        if (!Number.isFinite(clusterId) || !feature) return;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [
          number,
          number,
        ];
        map.easeTo({ center: coordinates, zoom, duration: 500 });
      });
      [VENUE_LAYER_ID, CLUSTER_LAYER_ID].forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    }

  }, [locale, mapState, selectedId, places]);

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

  const selectedBookable = Boolean(selected?.in_database && selected?.venue_id);
  const hasMeta =
    !!selected &&
    ((selected.cuisine && selected.cuisine.length > 0) ||
      typeof selected.price_level === "number" ||
      typeof selected.average_check === "number");

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
              <span>
                <i /> {loading ? copy.loadingVenues : `${places.length} ${copy.online}`}
              </span>
              {!useGoogle && <small>{copy.updated}</small>}
            </div>
            <div className="venue-map-legend" aria-label={copy.legendAria}>
              <span><i className="legend-dot legend-dot-ours" /> {copy.legendOurs}</span>
              {useGoogle && <span><i className="legend-dot legend-dot-other" /> {copy.legendOther}</span>}
            </div>
          </>
        )}
      </div>

      <div className="venue-map-panel">
        {loadError && (
          <p role="status" className="venue-map-address">
            {labels.loadError}{" "}<button type="button" onClick={() => setRetry((attempt) => attempt + 1)}>{labels.retry}</button>
          </p>
        )}
        {useGoogle && (googleStatus === "unavailable" || googleStatus === "disabled") && <p role="status" className="venue-map-address">{labels.providerError}</p>}
        <div className="venue-map-list" aria-label={copy.cityVenues}>
          {(compact ? places.slice(0, 4) : places).map((place, index) => {
            const isSelected = place.id === selected?.id;
            return (
              <button
                type="button"
                key={place.id}
                aria-pressed={isSelected}
                className={`venue-map-item ${isSelected ? "active" : ""}`}
                onClick={() => selectPlace(place)}
              >
                <b className={`venue-num ${isSelected ? "active" : ""}`}>{index + 1}</b>
                <span className="venue-name">{pickLocale(place.name, locale)}</span>
                {preferences && index < 3 && (
                  <em className="venue-map-badge">{discoverCopy.recommended}</em>
                )}
                <small className="venue-status-pill">
                  {place.in_database ? (
                    <>
                      <span className={`status-dot ${place.open_now ? "open" : "closed"}`} />
                      {place.free_tables ?? 0} {copy.free}
                    </>
                  ) : typeof place.rating === "number" ? (
                    `★ ${place.rating.toFixed(1)}`
                  ) : (
                    copy.comingSoon
                  )}
                </small>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="venue-card-details">
            <div className="venue-card-header">
              <div>
                <span className="eyebrow">{copy.nearby}</span>
                <h3>{pickLocale(selected.name, locale)}</h3>
              </div>
              <div className="venue-card-badges">
                {selected.in_database && (
                  <span className="venue-bookable-badge">{copy.bookableBadge}</span>
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
                  <span>{selected.cuisine.slice(0, 2).join(" · ")}</span>
                )}
                {typeof selected.price_level === "number" && (
                  <span>{priceLevelLabel(selected.price_level)}</span>
                )}
                {typeof selected.average_check === "number" && (
                  <span>~{selected.average_check} MDL</span>
                )}
              </div>
            )}

            {selectedBookable ? (
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
                <strong>{selected.free_tables ?? 0} {copy.free}</strong>
              </div>
            ) : null}

            <div className="venue-card-footer">
              {selected.google_place_id && (
                <a
                  className="map-secondary-action"
                  href={googleMapSearch(pickLocale(selected.name, locale), selected.google_place_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Maps ↗
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
                  <span>{locale === "ru" ? "Сайт ресторана" : locale === "ro" ? "Site-ul restaurantului" : "Restaurant website"}</span>
                </a>
              )}

              {selectedBookable && (
                <div className="venue-map-actions">
                  <Link
                    href={venueBookingHref(selected.venue_id as string)}
                    className="map-primary-action"
                  >
                    {copy.action} <span>→</span>
                  </Link>
                  <Link
                    href={`/venues/${encodeURIComponent(selected.venue_id as string)}`}
                    className="map-secondary-action"
                  >
                    {copy.openPage}
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="venue-map-address">
            {preferences && !loading && places.length === 0
              ? discoverCopy.filtersEmpty
              : copy.empty}
          </p>
        )}

        {nearbyDenied && (
          <p className="venue-map-address" role="status">
            {discoverCopy.nearbyDenied}
          </p>
        )}
      </div>
    </div>
  );
}
