"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import {
  fetchMapPlaces,
  pickLocale,
  priceLevelLabel,
  type LocaleCode,
  type MapPlace,
} from "@/lib/api";
import {
  filterAndRankPlaces,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type MapState = "loading" | "ready" | "error";
type PlacePointProperties = {
  placeId: string;
  venueId: string;
  inDatabase: boolean;
  index: string;
  name: string;
  selected: boolean;
};

const BALTI_CENTER: [number, number] = [27.9289, 47.7622];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "foodassistant-venues";
const CLUSTER_LAYER_ID = "foodassistant-clusters";
const VENUE_LAYER_ID = "foodassistant-venue-pins";

const mapCopy = {
  ru: { unavailable: "Карта временно недоступна", unavailableBody: "Рестораны и свободные столы остаются доступными в списке справа.", openExternal: "Открыть Бельцы на OpenStreetMap",   online: "заведений онлайн", aria: "Интерактивная карта ресторанов Бельц", loadingMap: "Загружаем карту Бельц…", loadingVenues: "Загружаем заведения", updated: "OpenStreetMap · обновляется автоматически", nearby: "Рядом с вами", cityVenues: "Рестораны Бельц", open: "Открыто сейчас", closed: "Сейчас закрыто", free: "свободных столов", tables: "столов", empty: "После публикации рестораны автоматически появятся здесь.", action: "Выбрать стол", openPage: "Страница ресторана", popupFree: "свободно", popupBook: "Забронировать", legendAria: "Легенда карты", legendOurs: "В FoodAssistant — можно забронировать", legendOther: "Другие заведения", comingSoon: "Скоро в FoodAssistant", bookableBadge: "Можно забронировать" },
  en: { unavailable: "Map temporarily unavailable", unavailableBody: "Restaurants and available tables are still listed on the right.", openExternal: "Open Bălți in OpenStreetMap", online: "venues online", aria: "Interactive map of Bălți restaurants", loadingMap: "Loading Bălți map…", loadingVenues: "Loading venues", updated: "OpenStreetMap · updates automatically", nearby: "Near you", cityVenues: "Bălți restaurants", open: "Open now", closed: "Closed now", free: "tables available", tables: "tables", empty: "Restaurants appear here automatically after publication.", action: "Choose a table", openPage: "Restaurant page", popupFree: "free", popupBook: "Book", legendAria: "Map legend", legendOurs: "In FoodAssistant — bookable", legendOther: "Other places", comingSoon: "Coming soon to FoodAssistant", bookableBadge: "Bookable" },
  ro: { unavailable: "Harta este temporar indisponibilă", unavailableBody: "Restaurantele și mesele libere rămân disponibile în lista din dreapta.", openExternal: "Deschide Bălți în OpenStreetMap", online: "localuri online", aria: "Harta interactivă a restaurantelor din Bălți", loadingMap: "Se încarcă harta Bălți…", loadingVenues: "Se încarcă localurile", updated: "OpenStreetMap · se actualizează automat", nearby: "În apropiere", cityVenues: "Restaurante din Bălți", open: "Deschis acum", closed: "Închis acum", free: "mese libere", tables: "mese", empty: "Restaurantele apar automat aici după publicare.", action: "Alege masa", openPage: "Pagina restaurantului", popupFree: "libere", popupBook: "Rezervă", legendAria: "Legenda hărții", legendOurs: "În FoodAssistant — se poate rezerva", legendOther: "Alte localuri", comingSoon: "În curând în FoodAssistant", bookableBadge: "Se poate rezerva" },
} as const;

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

function FreeMapFallback({ places, locale }: { places: MapPlace[]; locale: LocaleCode }) {
  const copy = mapCopy[locale];
  return (
    <div className="live-map-fallback" role="status">
      <div className="live-map-fallback-grid" aria-hidden>
        <i className="one" />
        <i className="two" />
        <i className="three" />
        {places.slice(0, 4).map((place, index) => (
          <span
            key={place.id}
            style={{
              left: `${22 + index * 17}%`,
              top: `${57 - (index % 2) * 22}%`,
            }}
          >
            <b>{index + 1}</b>
          </span>
        ))}
      </div>
      <div className="live-map-fallback-card">
        <span className="open-map-brand-mark">M</span>
        <div>
          <strong>{copy.unavailable}</strong>
          <p>{copy.unavailableBody}</p>
          <a
            href="https://www.openstreetmap.org/#map=14/47.7622/27.9289"
            target="_blank"
            rel="noreferrer"
          >
            {copy.openExternal} →
          </a>
        </div>
      </div>
      <div className="venue-map-status">
        <i /> {places.length} {copy.online}
      </div>
    </div>
  );
}

export function VenueMap({
  compact = false,
  preferences,
}: {
  compact?: boolean;
  preferences?: DiscoverPreferences;
}) {
  const { locale } = useLocale();
  const copy = mapCopy[locale];
  const discoverCopy = getSiteCopy(locale).discover;
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const placesRef = useRef<MapPlace[]>([]);
  const localeRef = useRef(locale);
  const fittedPlacesRef = useRef("");
  const [allPlaces, setAllPlaces] = useState<MapPlace[]>([]);
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [nearbyDenied, setNearbyDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapState, setMapState] = useState<MapState>("loading");

  const ranked = useMemo(() => {
    if (!preferences) return allPlaces.map((place) => ({ place, score: 0 }));
    return filterAndRankPlaces(allPlaces, preferences, {
      userLat: userGeo?.lat,
      userLng: userGeo?.lng,
    });
  }, [allPlaces, preferences, userGeo]);

  const places = useMemo(() => ranked.map((r) => r.place), [ranked]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    if (!preferences?.practical.includes("nearby")) {
      setNearbyDenied(false);
      setUserGeo(null);
      return;
    }
    if (!navigator.geolocation) {
      setNearbyDenied(true);
      return;
    }
    setNearbyDenied(false);
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
    const root = document.createElement("div");
    root.className = "venue-map-popup-card";

    const title = document.createElement("strong");
    title.textContent = name;
    root.appendChild(title);

    if (typeof place.rating === "number") {
      const rating = document.createElement("div");
      rating.className = "venue-map-popup-rating";
      rating.textContent = `★ ${place.rating.toFixed(1)}`;
      root.appendChild(rating);
    }

    if (bookable) {
      if (typeof place.free_tables === "number") {
        const free = document.createElement("div");
        free.className = "venue-map-popup-free";
        const freeCount = document.createElement("b");
        freeCount.textContent = String(place.free_tables);
        free.appendChild(freeCount);
        free.appendChild(document.createTextNode(` ${labels.popupFree}`));
        root.appendChild(free);
      }

      const actions = document.createElement("div");
      actions.className = "venue-map-popup-actions";

      const pageLink = document.createElement("a");
      pageLink.href = `/venues/${encodeURIComponent(place.venue_id as string)}`;
      pageLink.textContent = labels.openPage;
      actions.appendChild(pageLink);

      const bookLink = document.createElement("a");
      bookLink.href = `/book?venue=${encodeURIComponent(place.venue_id as string)}`;
      bookLink.className = "primary";
      bookLink.textContent = labels.popupBook;
      actions.appendChild(bookLink);

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
      maxWidth: "280px",
      className: "venue-map-popup",
      anchor: "bottom",
    })
      .setLngLat([place.lng, place.lat])
      .setDOMContent(root)
      .addTo(map);
  }

  useEffect(() => {
    let active = true;
    fetchMapPlaces()
      .then((data) => {
        if (!active) return;
        const sorted = sortPlaces(data.places ?? []);
        setAllPlaces(sorted);
        setSelectedId(sorted[0]?.id ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapNodeRef.current) return;

    fittedPlacesRef.current = "";
    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: OPEN_FREE_MAP_STYLE,
      center: BALTI_CENTER,
      zoom: 13.6,
      minZoom: 10,
      maxZoom: 19,
      cooperativeGestures: true,
      attributionControl: false,
    });
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
  }, [compact]);

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
        id: "foodassistant-cluster-halo",
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
        id: "foodassistant-cluster-count",
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
        id: "foodassistant-venue-halo",
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
        id: "foodassistant-venue-index",
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
        id: "foodassistant-venue-name",
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

    const placeGeometryKey = places
      .map((place) => `${place.id}:${place.lat}:${place.lng}`)
      .join("|");
    if (places.length > 0 && fittedPlacesRef.current !== placeGeometryKey) {
      const bounds = new maplibregl.LngLatBounds();
      places.forEach((place) => bounds.extend([place.lng, place.lat]));
      map.fitBounds(bounds, {
        padding: compact ? 48 : 72,
        maxZoom: 15.5,
        duration: 0,
      });
      fittedPlacesRef.current = placeGeometryKey;
    }
  }, [compact, locale, mapState, selectedId, places]);

  const selected = useMemo(
    () => places.find((place) => place.id === selectedId) ?? places[0],
    [selectedId, places],
  );

  function selectPlace(place: MapPlace) {
    setSelectedId(place.id);
    const map = mapRef.current;
    map?.easeTo({
      center: [place.lng, place.lat],
      zoom: 15.2,
      duration: 520,
    });
    if (map) showVenuePopup(place, map);
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
        className="venue-map-canvas live-map-canvas"
        aria-label={copy.aria}
      >
        <div ref={mapNodeRef} className="live-map-surface" />
        {mapState === "error" && <FreeMapFallback places={places} locale={locale} />}
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
              <small>{copy.updated}</small>
            </div>
            <div className="venue-map-legend" aria-label={copy.legendAria}>
              <span><i className="legend-dot legend-dot-ours" /> {copy.legendOurs}</span>
              <span><i className="legend-dot legend-dot-other" /> {copy.legendOther}</span>
            </div>
          </>
        )}
      </div>

      <div className="venue-map-panel">
        <div className="venue-map-panel-head">
          <div>
            <span className="eyebrow">{copy.nearby}</span>
            <h3>
              {selected ? pickLocale(selected.name, locale) : copy.cityVenues}
            </h3>
          </div>
          <div className="venue-map-panel-head-badges">
            {selected?.in_database && (
              <span className="venue-bookable-badge">{copy.bookableBadge}</span>
            )}
            {selected && typeof selected.rating === "number" && (
              <span className="venue-rating">★ {selected.rating.toFixed(1)}</span>
            )}
          </div>
        </div>

        {selected ? (
          <>
            <p className="venue-map-address">
              ⌖ {pickLocale(selected.address, locale)}
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
              <div className="venue-availability">
                <span>
                  <i /> {selected.open_now ? copy.open : copy.closed}
                </span>
                <strong>{selected.free_tables ?? 0} {copy.free}</strong>
              </div>
            ) : (
              <div className="venue-availability venue-availability-comingsoon">
                <span>{copy.comingSoon}</span>
              </div>
            )}
            {selected.website && (
              <a
                className="venue-map-website"
                href={selected.website}
                target="_blank"
                rel="noreferrer"
              >
                ↗ {locale === "ru" ? "Сайт ресторана" : locale === "ro" ? "Site-ul restaurantului" : "Restaurant website"}
              </a>
            )}
          </>
        ) : (
          <p className="venue-map-address">
            {preferences && !loading ? discoverCopy.filtersEmpty : copy.empty}
          </p>
        )}

        {nearbyDenied && (
          <p className="venue-map-address" role="status">
            {discoverCopy.nearbyDenied}
          </p>
        )}

        <div className="venue-map-list">
          {places.slice(0, compact ? 3 : 4).map((place, index) => (
            <button
              type="button"
              key={place.id}
              className={place.id === selected?.id ? "active" : ""}
              onClick={() => selectPlace(place)}
            >
              <b>{index + 1}</b>
              <span>
                {pickLocale(place.name, locale)}
                {preferences && index < 3 && (
                  <em className="venue-map-badge">{discoverCopy.recommended}</em>
                )}
                {place.in_database && (
                  <em className="venue-map-badge">{copy.bookableBadge}</em>
                )}
              </span>
              <small>
                {place.in_database
                  ? `${place.free_tables ?? 0} ${copy.tables}`
                  : typeof place.rating === "number"
                    ? `★ ${place.rating.toFixed(1)}`
                    : copy.comingSoon}
              </small>
            </button>
          ))}
        </div>

        {selectedBookable && selected && (
          <div className="venue-map-actions">
            <Link
              href={`/venues/${encodeURIComponent(selected.venue_id as string)}`}
              className="map-secondary-action"
            >
              {copy.openPage}
            </Link>
            <Link
              href={`/book?venue=${encodeURIComponent(selected.venue_id as string)}`}
              className="map-primary-action"
            >
              {copy.action} <span>→</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
