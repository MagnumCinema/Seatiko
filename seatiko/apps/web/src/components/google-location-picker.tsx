"use client";

import { useEffect, useRef, useState } from "react";
import type { LocaleCode, MapCoordinates } from "@/lib/api";
import { loadGoogleMaps, onGoogleMapAuthFailure } from "@/lib/google-map";

export function GoogleLocationPicker({ apiKey, mapId, center, point, disabled, locale, onChange, onError }: {
  apiKey: string;
  mapId: string;
  center: MapCoordinates;
  point: MapCoordinates | null;
  disabled: boolean;
  locale: LocaleCode;
  onChange: (point: MapCoordinates) => void;
  onError: () => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const initialView = useRef(point ?? center);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let active = true;
    const fail = () => { if (active) onError(); };
    const unregister = onGoogleMapAuthFailure(fail);
    const timer = window.setTimeout(fail, 12000);
    let click: google.maps.MapsEventListener | undefined;
    let ready: google.maps.MapsEventListener | undefined;

    loadGoogleMaps(apiKey, locale).then(([{ Map }]) => {
      if (!active) return;
      const instance = new Map(node, {
        center: initialView.current,
        mapId: mapId || "DEMO_MAP_ID",
        zoom: 14,
        gestureHandling: "cooperative",
        mapTypeControl: false,
        streetViewControl: false,
        clickableIcons: false,
      });
      if (!disabled) click = instance.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onChangeRef.current(event.latLng.toJSON());
      });
      ready = instance.addListener("idle", () => {
        ready?.remove();
        clearTimeout(timer);
        if (active) setMap(instance);
      });
    }).catch(fail);

    return () => {
      active = false;
      unregister();
      clearTimeout(timer);
      click?.remove();
      ready?.remove();
      node.replaceChildren();
    };
  }, [apiKey, mapId, disabled, locale, onError]);

  useEffect(() => {
    if (!map || !point) return;
    let active = true;
    let marker: google.maps.marker.AdvancedMarkerElement | undefined;
    let listener: google.maps.MapsEventListener | undefined;
    loadGoogleMaps(apiKey).then(([, { AdvancedMarkerElement }]) => {
      if (!active) return;
      marker = new AdvancedMarkerElement({ map, position: point, gmpDraggable: !disabled });
      listener = marker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onChangeRef.current(event.latLng.toJSON());
      });
    }).catch(onError);
    return () => {
      active = false;
      listener?.remove();
      if (marker) marker.map = null;
    };
  }, [map, point, disabled, apiKey, onError]);

  return <div ref={nodeRef} className="owner-location-map" />;
}
