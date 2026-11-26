"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { GoogleLocationPicker } from "@/components/google-location-picker";
import type { LocaleCode, MapConfig, MapCoordinates } from "@/lib/api";
import { applyMapLibreLocalization, getMapLibreLocale } from "@/lib/maplibre-locale";

const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const PIN_COLOR = "#e9b96e";

type PickerProps = {
  center: MapCoordinates;
  point: MapCoordinates | null;
  readOnly: boolean;
  locale: LocaleCode;
  onChange: (point: MapCoordinates) => void;
};

/** Venue pin on a map: Google Maps when the server has a key, OpenFreeMap otherwise (or when Google fails). */
export function VenueLocationPicker({ config, ...props }: PickerProps & { config: MapConfig | null }) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const fallback = useCallback(() => setGoogleFailed(true), []);
  if (config?.google_maps_key && !googleFailed) {
    return (
      <GoogleLocationPicker
        apiKey={config.google_maps_key}
        mapId={config.google_maps_id}
        center={props.center}
        point={props.point}
        disabled={props.readOnly}
        locale={props.locale}
        onError={fallback}
        onChange={(next) => props.onChange({ lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) })}
      />
    );
  }
  return <OpenLocationPicker {...props} />;
}

function OpenLocationPicker({ center, point, readOnly, locale, onChange }: PickerProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const localeRef = useRef(locale);
  const initialPoint = useRef(point);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    localeRef.current = locale;
    if (mapRef.current) applyMapLibreLocalization(mapRef.current, locale);
  }, [locale]);

  useEffect(() => {
    if (!nodeRef.current) return;
    const start = initialPoint.current;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: nodeRef.current,
        style: FREE_MAP_STYLE,
        center: start ? [start.lng, start.lat] : [center.lng, center.lat],
        zoom: start ? 16 : 13.8,
        minZoom: 8,
        maxZoom: 19,
        attributionControl: false,
        cooperativeGestures: true,
        locale: getMapLibreLocale(localeRef.current),
      });
    } catch {
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.once("load", () => applyMapLibreLocalization(map, localeRef.current));

    const report = (lngLat: maplibregl.LngLat) =>
      onChangeRef.current({ lat: Number(lngLat.lat.toFixed(6)), lng: Number(lngLat.lng.toFixed(6)) });
    if (!readOnly) {
      map.on("click", (event) => {
        markerRef.current?.setLngLat(event.lngLat);
        report(event.lngLat);
      });
    }
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [readOnly, center]);

  // Pin follows the point (map clicks, drags, typed coordinates); the view follows when the pin leaves it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: PIN_COLOR, draggable: !readOnly }).setLngLat([point.lng, point.lat]).addTo(map);
      marker.on("dragend", () => {
        const next = marker.getLngLat();
        onChangeRef.current({ lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([point.lng, point.lat]);
    }
    if (!map.getBounds().contains([point.lng, point.lat])) map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 15) });
  }, [point, readOnly, center]);

  return <div ref={nodeRef} className="owner-location-map" />;
}
