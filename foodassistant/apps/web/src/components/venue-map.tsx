"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import {
  fetchVenues,
  pickLocale,
  priceLevelLabel,
  type LocaleCode,
  type Venue,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";

type MapState = "loading" | "ready" | "error";
type VenuePointProperties = {
  venueId: string;
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
  ru: { unavailable: "Карта временно недоступна", unavailableBody: "Рестораны и свободные столы остаются доступными в списке справа.", openExternal: "Открыть Бельцы на OpenStreetMap",   online: "заведений онлайн", aria: "Интерактивная карта ресторанов Бельц", loadingMap: "Загружаем карту Бельц…", loadingVenues: "Загружаем заведения", updated: "OpenStreetMap · обновляется автоматически", nearby: "Рядом с вами", cityVenues: "Рестораны Бельц", open: "Открыто сейчас", closed: "Сейчас закрыто", free: "свободных столов", tables: "столов", empty: "После публикации рестораны автоматически появятся здесь.", action: "Выбрать стол", openPage: "Страница ресторана", popupFree: "свободно", popupBook: "Забронировать" },
  en: { unavailable: "Map temporarily unavailable", unavailableBody: "Restaurants and available tables are still listed on the right.", openExternal: "Open Bălți in OpenStreetMap", online: "venues online", aria: "Interactive map of Bălți restaurants", loadingMap: "Loading Bălți map…", loadingVenues: "Loading venues", updated: "OpenStreetMap · updates automatically", nearby: "Near you", cityVenues: "Bălți restaurants", open: "Open now", closed: "Closed now", free: "tables available", tables: "tables", empty: "Restaurants appear here automatically after publication.", action: "Choose a table", openPage: "Restaurant page", popupFree: "free", popupBook: "Book" },
  ro: { unavailable: "Harta este temporar indisponibilă", unavailableBody: "Restaurantele și mesele libere rămân disponibile în lista din dreapta.", openExternal: "Deschide Bălți în OpenStreetMap", online: "localuri online", aria: "Harta interactivă a restaurantelor din Bălți", loadingMap: "Se încarcă harta Bălți…", loadingVenues: "Se încarcă localurile", updated: "OpenStreetMap · se actualizează automat", nearby: "În apropiere", cityVenues: "Restaurante din Bălți", open: "Deschis acum", closed: "Închis acum", free: "mese libere", tables: "mese", empty: "Restaurantele apar automat aici după publicare.", action: "Alege masa", openPage: "Pagina restaurantului", popupFree: "libere", popupBook: "Rezervă" },
} as const;

function venueCollection(
  venues: Venue[],
  locale: LocaleCode,
  selectedId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, VenuePointProperties> {
  return {
    type: "FeatureCollection",
    features: venues.map((venue, index) => ({
      type: "Feature",
      id: venue.id,
      geometry: {
        type: "Point",
        coordinates: [venue.lng, venue.lat],
      },
      properties: {
        venueId: venue.id,
        index: String(index + 1),
        name: pickLocale(venue.name, locale),
        selected: venue.id === selectedId,
      },
    })),
  };
}

function FreeMapFallback({ venues, locale }: { venues: Venue[]; locale: LocaleCode }) {
  const copy = mapCopy[locale];
  return (
    <div className="live-map-fallback" role="status">
      <div className="live-map-fallback-grid" aria-hidden>
        <i className="one" />
        <i className="two" />
        <i className="three" />
        {venues.slice(0, 4).map((venue, index) => (
          <span
            key={venue.id}
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
        <i /> {venues.length} {copy.online}
      </div>
    </div>
  );
}

export function VenueMap({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const copy = mapCopy[locale];
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const venuesRef = useRef<Venue[]>([]);
  const localeRef = useRef(locale);
  const fittedVenuesRef = useRef("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapState, setMapState] = useState<MapState>("loading");

  useEffect(() => {
    venuesRef.current = venues;
  }, [venues]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  function showVenuePopup(venue: Venue, map: maplibregl.Map) {
    const labels = mapCopy[localeRef.current];
    const name = pickLocale(venue.name, localeRef.current);
    const root = document.createElement("div");
    root.className = "venue-map-popup-card";

    const title = document.createElement("strong");
    title.textContent = name;
    root.appendChild(title);

    const rating = document.createElement("div");
    rating.className = "venue-map-popup-rating";
    rating.textContent = `★ ${venue.rating.toFixed(1)}${
      venue.review_count ? ` · ${venue.review_count}` : ""
    }`;
    root.appendChild(rating);

    const free = document.createElement("div");
    free.className = "venue-map-popup-free";
    const freeCount = document.createElement("b");
    freeCount.textContent = String(venue.free_tables);
    free.appendChild(freeCount);
    free.appendChild(document.createTextNode(` ${labels.popupFree}`));
    root.appendChild(free);

    const actions = document.createElement("div");
    actions.className = "venue-map-popup-actions";

    const pageLink = document.createElement("a");
    pageLink.href = `/venues/${encodeURIComponent(venue.id)}`;
    pageLink.textContent = labels.openPage;
    actions.appendChild(pageLink);

    const bookLink = document.createElement("a");
    bookLink.href = `/book?venue=${encodeURIComponent(venue.id)}`;
    bookLink.className = "primary";
    bookLink.textContent = labels.popupBook;
    actions.appendChild(bookLink);

    root.appendChild(actions);

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({
      offset: 18,
      closeButton: true,
      maxWidth: "280px",
      className: "venue-map-popup",
      anchor: "bottom",
    })
      .setLngLat([venue.lng, venue.lat])
      .setDOMContent(root)
      .addTo(map);
  }

  useEffect(() => {
    let active = true;
    fetchVenues()
      .then((items) => {
        if (!active) return;
        setVenues(items);
        setSelectedId(items[0]?.id ?? null);
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

    fittedVenuesRef.current = "";
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
      venues.find((venue) => venue.id === selectedId)?.id ?? venues[0]?.id ?? null;
    const data = venueCollection(venues, locale, effectiveSelectedId);
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
            "#175f43",
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
        const venueId = String(feature?.properties?.venueId ?? "");
        const venue = venuesRef.current.find((item) => item.id === venueId);
        if (!venue) return;
        setSelectedId(venue.id);
        map.easeTo({ center: [venue.lng, venue.lat], zoom: 15.2, duration: 520 });
        showVenuePopup(venue, map);
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

    const venueGeometryKey = venues
      .map((venue) => `${venue.id}:${venue.lat}:${venue.lng}`)
      .join("|");
    if (venues.length > 0 && fittedVenuesRef.current !== venueGeometryKey) {
      const bounds = new maplibregl.LngLatBounds();
      venues.forEach((venue) => bounds.extend([venue.lng, venue.lat]));
      map.fitBounds(bounds, {
        padding: compact ? 48 : 72,
        maxZoom: 15.5,
        duration: 0,
      });
      fittedVenuesRef.current = venueGeometryKey;
    }
  }, [compact, locale, mapState, selectedId, venues]);

  const selected = useMemo(
    () => venues.find((venue) => venue.id === selectedId) ?? venues[0],
    [selectedId, venues],
  );

  function selectVenue(venue: Venue) {
    setSelectedId(venue.id);
    const map = mapRef.current;
    map?.easeTo({
      center: [venue.lng, venue.lat],
      zoom: 15.2,
      duration: 520,
    });
    if (map) showVenuePopup(venue, map);
  }

  return (
    <div className={`venue-map-shell ${compact ? "compact" : ""}`}>
      <div
        className="venue-map-canvas live-map-canvas"
        aria-label={copy.aria}
      >
        <div ref={mapNodeRef} className="live-map-surface" />
        {mapState === "error" && <FreeMapFallback venues={venues} locale={locale} />}
        {mapState === "loading" && (
          <div className="live-map-loading">
            <span />
            <p>{copy.loadingMap}</p>
          </div>
        )}
        {mapState === "ready" && (
          <div className="live-map-status">
            <span>
              <i /> {loading ? copy.loadingVenues : `${venues.length} ${copy.online}`}
            </span>
            <small>{copy.updated}</small>
          </div>
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
          {selected && (
            <span className="venue-rating">★ {selected.rating.toFixed(1)}</span>
          )}
        </div>

        {selected ? (
          <>
            <p className="venue-map-address">
              ⌖ {pickLocale(selected.address, locale)}
            </p>
            <div className="venue-map-meta">
              <span>{selected.cuisine.slice(0, 2).join(" · ")}</span>
              <span>{priceLevelLabel(selected.price_level)}</span>
              <span>~{selected.average_check} MDL</span>
            </div>
            <div className="venue-availability">
              <span>
                <i /> {selected.open_now ? copy.open : copy.closed}
              </span>
              <strong>{selected.free_tables} {copy.free}</strong>
            </div>
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
            {copy.empty}
          </p>
        )}

        <div className="venue-map-list">
          {venues.slice(0, compact ? 3 : 4).map((venue, index) => (
            <button
              type="button"
              key={venue.id}
              className={venue.id === selected?.id ? "active" : ""}
              onClick={() => selectVenue(venue)}
            >
              <b>{index + 1}</b>
              <span>{pickLocale(venue.name, locale)}</span>
              <small>{venue.free_tables} {copy.tables}</small>
            </button>
          ))}
        </div>

        <div className="venue-map-actions">
          <Link
            href={selected ? `/venues/${encodeURIComponent(selected.id)}` : "/"}
            className="map-secondary-action"
          >
            {copy.openPage}
          </Link>
          <Link
            href={selected ? `/book?venue=${encodeURIComponent(selected.id)}` : "/book"}
            className="map-primary-action"
          >
            {copy.action} <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
