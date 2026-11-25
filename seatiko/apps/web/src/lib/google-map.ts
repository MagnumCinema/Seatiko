import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { LocaleCode, MapCoordinates } from "@/lib/api";

let googleLibraries: Promise<[google.maps.MapsLibrary, google.maps.MarkerLibrary]> | undefined;

export function loadGoogleMaps(key: string, language?: LocaleCode) {
  if (!googleLibraries) {
    setOptions({ key, v: "quarterly", region: "MD", ...(language ? { language } : {}) });
    googleLibraries = Promise.all([importLibrary("maps"), importLibrary("marker")]);
  }
  return googleLibraries;
}

let authenticationFailed = false;
let authListenerInstalled = false;
const authFailureListeners = new Set<() => void>();

export function onGoogleMapAuthFailure(callback: () => void) {
  const browser = window as Window & { gm_authFailure?: () => void };
  if (authenticationFailed) {
    callback();
    return () => {};
  }
  if (!authListenerInstalled) {
    authListenerInstalled = true;
    const previous = browser.gm_authFailure;
    browser.gm_authFailure = () => {
      authenticationFailed = true;
      previous?.();
      authFailureListeners.forEach((notify) => notify());
    };
  }
  authFailureListeners.add(callback);
  return () => { authFailureListeners.delete(callback); };
}

export function googleMapSearch(query: string, placeId?: string) {
  const params = new URLSearchParams({ api: "1", query });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

export function googleMapCoordinates(point: MapCoordinates) {
  return googleMapSearch(`${point.lat},${point.lng}`);
}
