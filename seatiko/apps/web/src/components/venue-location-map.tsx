"use client";

import "@/app/venue-map.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { pickLocale, type Venue } from "@/lib/api";
import { googleMapDirections, googleMapSearch } from "@/lib/google-map";
import { MAP_TILE_STYLES, venueAsMapPlace } from "@/lib/home-map";
import { venueHoursLabel } from "@/lib/venue-hours";
import { applyMapLibreLocalization, getMapLibreLocale } from "@/lib/maplibre-locale";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { MapStateCard, SelectedCard, createPartnerPin, mapCopy } from "@/components/venue-map-parts";

export const VENUE_LOCATION_ANCHOR = "venue-location";

const NO_SAVED: ReadonlySet<string> = new Set();
/** The venue at street level, with the neighbourhood around it. */
const VENUE_ZOOM = 16;

function hasCoords(venue: Pick<Venue, "lat" | "lng">) {
  return Number.isFinite(venue.lat) && Number.isFinite(venue.lng) && !(venue.lat === 0 && venue.lng === 0);
}

/**
 * "How to get there", in the home map's look: theme tiles (dark in the dark theme), the
 * partner pill pin, glass zoom buttons, and the home map's selected-place card with the
 * address, open status, weekly hours and Directions / Google Maps buttons.
 */
export function VenueLocationMap({
  venue,
  bookable,
  freeTables,
  cover,
}: {
  venue: Venue;
  bookable: boolean;
  /** Live free tables from the floor plan (falls back to the venue's count). */
  freeTables?: number;
  /** First photo of the venue for the card thumbnail. */
  cover?: string;
}) {
  const { locale, t } = useLocale();
  const { theme } = useTheme();
  const { vm, hm } = mapCopy(locale);
  const sectionRef = useRef<HTMLElement>(null);
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const localeRef = useRef(locale);
  const [visible, setVisible] = useState(false);
  const [mapState, setMapState] = useState<"idle" | "ready" | "error">("idle");
  const [now] = useState(() => new Date());
  const coords = hasCoords(venue);
  const name = pickLocale(venue.name, locale);
  const address = pickLocale(venue.address, locale);
  // The venue's own hours in the guest's language, else the demo hours.
  const hours = venueHoursLabel(venue, locale);
  const place = useMemo(() => venueAsMapPlace(venue, { bookable, freeTables }), [venue, bookable, freeTables]);

  useEffect(() => {
    localeRef.current = locale;
    if (mapRef.current && mapState === "ready") applyMapLibreLocalization(mapRef.current, locale);
  }, [locale, mapState]);

  // The map loads only when the section comes near the screen.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !coords) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [coords]);

  // A theme switch rebuilds the map on the matching (light or dark) tiles, as on the home map.
  useEffect(() => {
    if (!visible || !mapNodeRef.current) return;
    const center: [number, number] = [venue.lng, venue.lat];
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: MAP_TILE_STYLES[theme],
        center,
        zoom: VENUE_ZOOM,
        minZoom: 11,
        maxZoom: 19,
        cooperativeGestures: true,
        attributionControl: false,
        locale: getMapLibreLocale(localeRef.current),
      });
    } catch {
      // No WebGL (old device, hardware acceleration off): the card keeps the address and buttons.
      queueMicrotask(() => setMapState("error"));
      return;
    }
    mapRef.current = map;
    // ODbL credit folded into an (i) button, like the home map.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.once("load", () => {
      map.getContainer().querySelectorAll(".maplibregl-compact-show").forEach((el) => el.classList.remove("maplibregl-compact-show"));
      applyMapLibreLocalization(map, localeRef.current);
      setMapState("ready");
    });
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });
    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [visible, venue.lat, venue.lng, theme]);

  // The partner pill pin (free tables + name), rebuilt when the count or language changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    markerRef.current?.remove();
    const pin = createPartnerPin(place, locale, NO_SAVED, "div");
    markerRef.current = new maplibregl.Marker({ element: pin, anchor: "bottom", offset: [0, -6] })
      .setLngLat([place.lng, place.lat])
      .addTo(map);
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [mapState, place, locale]);

  const actions = {
    primary: {
      href: coords ? googleMapDirections(venue) : googleMapSearch(`${name}, ${address}`, venue.google_place_id),
      label: vm.route,
      external: true,
    },
    secondary: { href: googleMapSearch(`${name}, ${address}`, venue.google_place_id), label: hm.googleMaps, external: true },
  };

  return (
    <section ref={sectionRef} id={VENUE_LOCATION_ANCHOR} className="venue-section venue-location">
      <div className="venue-section-head">
        <div>
          <h2>{t("venue.location_title")}</h2>
          <p>{t("venue.location_hint")}</p>
        </div>
      </div>
      <div className="vmap vloc">
        <div className="vloc-shell">
          <div className="vmap-canvas vloc-canvas" data-pin-zoom="">
            {coords ? (
              <div
                ref={mapNodeRef}
                className="vmap-surface"
                role="img"
                aria-label={t("venue.location_map_label", { venue: name })}
              />
            ) : null}
            {coords && mapState === "idle" ? (
              <div className="vmap-loading" role="status">
                <span />
                <p>{vm.loadingMap}</p>
              </div>
            ) : null}
            {!coords || mapState === "error" ? (
              <MapStateCard
                badge={t("venue.location_title")}
                title={coords ? vm.unavailable : address}
                body={coords ? t("venue.location_map_error") : t("venue.location_no_coords")}
              />
            ) : null}
            {mapState === "ready" ? (
              <div className="vmap-controls">
                <div className="vmap-control-stack">
                  <button
                    type="button"
                    className="vmap-control"
                    onClick={() => mapRef.current?.easeTo({ center: [venue.lng, venue.lat], zoom: VENUE_ZOOM, duration: 400 })}
                    aria-label={t("venue.location_recenter")}
                    title={t("venue.location_recenter")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="7" />
                      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                    </svg>
                  </button>
                </div>
                <div className="vmap-control-stack">
                  <button
                    type="button"
                    className="vmap-control"
                    onClick={() => mapRef.current?.zoomIn({ duration: 240 })}
                    aria-label={hm.zoomIn}
                    title={hm.zoomIn}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="vmap-control"
                    onClick={() => mapRef.current?.zoomOut({ duration: 240 })}
                    aria-label={hm.zoomOut}
                    title={hm.zoomOut}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="vloc-side">
            <SelectedCard place={place} cover={cover} locale={locale} now={now} actions={actions}>
              {hours ? (
                <div className="vloc-hours">
                  <span>{t("venue.location_hours")}</span>
                  <strong>{hours}</strong>
                </div>
              ) : null}
            </SelectedCard>
            <Link className="btn btn--link vloc-all" href="/#map">
              {t("venue.location_all")} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
