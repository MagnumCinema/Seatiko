"use client";

import { useEffect, useRef, useState } from "react";
import { pickLocale, type LocaleCode, type MapBounds, type MapCoordinates, type MapPlace } from "@/lib/api";
import { loadGoogleMaps, onGoogleMapAuthFailure } from "@/lib/google-map";

export function GoogleVenueMap({
  apiKey, mapId, bounds, places, locale, focus, compact, searchLabel,
  onReady, onError, onSelect, onSearch,
}: {
  apiKey: string;
  mapId: string;
  bounds: MapBounds;
  places: MapPlace[];
  locale: LocaleCode;
  focus: MapCoordinates | null;
  compact: boolean;
  searchLabel: string;
  onReady: () => void;
  onError: () => void;
  onSelect: (id: string) => void;
  onSearch: (bounds: MapBounds) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let disposed = false;
    const fail = () => { if (!disposed) onError(); };
    const unregister = onGoogleMapAuthFailure(fail);
    const timer = window.setTimeout(fail, 12000);
    let instance: google.maps.Map | undefined;
    let ready: google.maps.MapsEventListener | undefined;

    loadGoogleMaps(apiKey, locale)
      .then(([{ Map }]) => {
        if (disposed) return;
        instance = new Map(node, {
          mapId: mapId || "DEMO_MAP_ID",
          center: { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 },
          zoom: 8,
          maxZoom: 19,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !compact,
          clickableIcons: false,
        });
        instance.fitBounds(bounds, 28);
        ready = instance.addListener("idle", () => {
          ready?.remove();
          clearTimeout(timer);
          setMap(instance ?? null);
          onReady();
        });
      })
      .catch(fail);

    return () => {
      disposed = true;
      unregister();
      clearTimeout(timer);
      ready?.remove();
      node.replaceChildren();
    };
  }, [apiKey, mapId, bounds, compact, locale, onError, onReady]);

  useEffect(() => {
    if (!map) return;
    let active = true;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const listeners: google.maps.MapsEventListener[] = [];
    loadGoogleMaps(apiKey).then(([, { AdvancedMarkerElement, PinElement }]) => {
      if (!active) return;
      places.forEach((place, index) => {
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: place.lat, lng: place.lng },
          title: pickLocale(place.name, locale),
        });
        const pin = new PinElement({
          background: place.in_database ? "#175f43" : "#6d716f",
          borderColor: "#fffdf8",
          glyphColor: "#ffffff",
          glyphText: String(index + 1),
        });
        marker.append(pin);
        listeners.push(marker.addListener("click", () => onSelect(place.id)));
        markers.push(marker);
      });
    }).catch(onError);
    return () => {
      active = false;
      listeners.forEach((listener) => listener.remove());
      markers.forEach((marker) => { marker.map = null; });
    };
  }, [map, places, locale, apiKey, onError, onSelect]);

  useEffect(() => {
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, focus]);

  return (
    <>
      <div ref={nodeRef} className="live-map-surface" />
      {map && (
        <button type="button" className="map-search-area" onClick={() => {
          const viewport = map.getBounds()?.toJSON();
          if (viewport) onSearch(viewport);
        }}>
          {searchLabel}
        </button>
      )}
    </>
  );
}
