"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { pickLocale, type Venue } from "@/lib/api";
import { mapsRouteUrl } from "@/lib/booking-share";
import { getVenueHours } from "@/lib/venue-hours";
import { useLocale } from "@/components/locale-provider";
import { MapPinIcon } from "@/components/venue-icons";

const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const VENUE_LOCATION_ANCHOR = "venue-location";

function hasCoords(venue: Venue) {
  return Number.isFinite(venue.lat) && Number.isFinite(venue.lng) && !(venue.lat === 0 && venue.lng === 0);
}

/** "How to get there": small map with the venue pin, address, hours and directions. */
export function VenueLocationMap({ venue }: { venue: Venue }) {
  const { locale, t } = useLocale();
  const sectionRef = useRef<HTMLElement>(null);
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mapState, setMapState] = useState<"idle" | "ready" | "error">("idle");
  const coords = hasCoords(venue);
  const name = pickLocale(venue.name, locale);
  const address = pickLocale(venue.address, locale);
  const hours = getVenueHours(venue.id, locale);

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

  useEffect(() => {
    if (!visible || !mapNodeRef.current) return;
    const center: [number, number] = [venue.lng, venue.lat];
    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: OPEN_FREE_MAP_STYLE,
      center,
      zoom: 16,
      minZoom: 11,
      maxZoom: 19,
      cooperativeGestures: true,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const pin = document.createElement("div");
    pin.className = "venue-location-pin";
    pin.setAttribute("aria-hidden", "true");
    new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat(center).addTo(map);

    map.once("load", () => {
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      setMapState("ready");
    });
    map.on("error", () => {
      if (!map.loaded()) setMapState("error");
    });
    return () => map.remove();
  }, [visible, venue.lat, venue.lng]);

  const googleUrl = coords
    ? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;

  return (
    <section ref={sectionRef} id={VENUE_LOCATION_ANCHOR} className="venue-section venue-location">
      <div className="venue-section-head">
        <div>
          <h2>{t("venue.location_title")}</h2>
          <p>{t("venue.location_hint")}</p>
        </div>
      </div>
      <div className="venue-location-body">
        <div className="venue-location-map">
          {coords ? (
            <>
              <div ref={mapNodeRef} className="venue-location-canvas" aria-label={t("venue.location_map_label", { venue: name })} role="img" />
              {mapState !== "ready" ? (
                <p className="venue-location-status">
                  {mapState === "error" ? t("venue.location_map_error") : t("venue.loading")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="venue-location-status">{t("venue.location_no_coords")}</p>
          )}
        </div>
        <div className="venue-location-info">
          <div className="venue-location-address">
            <span className="venue-tile-icon">
              <MapPinIcon />
            </span>
            <div>
              <strong>{address}</strong>
              <span>{name}</span>
            </div>
          </div>
          {hours ? (
            <p className="venue-location-hours">
              <span className="booking-field-label">{t("venue.location_hours")}</span>
              {hours}
            </p>
          ) : null}
          <div className="venue-location-actions">
            <a className="venue-cta venue-cta-hero" href={mapsRouteUrl({ lat: venue.lat, lng: venue.lng, address, venueName: name })} target="_blank" rel="noopener noreferrer">
              {t("venue.location_route")}
            </a>
            <a className="venue-cta venue-cta-outline" href={googleUrl} target="_blank" rel="noopener noreferrer">
              {t("venue.location_google")}
            </a>
            <Link className="venue-location-all" href="/#map">
              {t("venue.location_all")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
