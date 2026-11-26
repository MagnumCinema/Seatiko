"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_LAYOUT, parseLayout, serializeLayout, type FloorLayout } from "@/lib/floor-layout";

/**
 * Where the bar / kitchen / entrance and table rotation of a venue are kept.
 *
 * The tables API only stores number, seats, x, y and zone, so until the backend keeps the
 * layout too (BACKEND_TASKS.md №28) it lives in this browser's localStorage, per venue.
 * Guests on other devices see the default bar / kitchen / entrance meanwhile.
 */
const PREFIX = "seatiko:floor-layout:";
const CHANGE_EVENT = "seatiko:floor-layout";

const key = (venueId: string) => `${PREFIX}${venueId}`;

function readRaw(venueId: string): string | null {
  try {
    return window.localStorage.getItem(key(venueId));
  } catch {
    return null;
  }
}

const cache = new Map<string, { raw: string | null; layout: FloorLayout }>();

export function readFloorLayout(venueId: string): FloorLayout {
  if (typeof window === "undefined" || !venueId) return EMPTY_LAYOUT;
  const raw = readRaw(venueId);
  const hit = cache.get(venueId);
  if (hit && hit.raw === raw) return hit.layout;
  let layout = EMPTY_LAYOUT;
  if (raw) {
    try {
      layout = parseLayout(JSON.parse(raw));
    } catch {
      layout = EMPTY_LAYOUT;
    }
  }
  cache.set(venueId, { raw, layout });
  return layout;
}

/** Saves the layout; returns false when the browser refuses storage (private mode, quota). */
export function writeFloorLayout(venueId: string, layout: FloorLayout): boolean {
  if (typeof window === "undefined" || !venueId) return false;
  try {
    window.localStorage.setItem(key(venueId), JSON.stringify(serializeLayout(layout)));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: venueId }));
  return true;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The venue's stored layout, updated live when it is saved here or in another tab. */
export function useFloorLayout(venueId: string | undefined): FloorLayout {
  return useSyncExternalStore(
    subscribe,
    () => (venueId ? readFloorLayout(venueId) : EMPTY_LAYOUT),
    () => EMPTY_LAYOUT,
  );
}
