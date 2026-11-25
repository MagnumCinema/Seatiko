import type maplibregl from "maplibre-gl";
import type { LocaleCode } from "@/lib/api";

const MAPLIBRE_LOCALES: Record<LocaleCode, Record<string, string>> = {
  ru: {
    "AttributionControl.ToggleAttribution": "Показать или скрыть сведения об источнике",
    "AttributionControl.MapFeedback": "Сообщить об ошибке на карте",
    "FullscreenControl.Enter": "На весь экран",
    "FullscreenControl.Exit": "Выйти из полноэкранного режима",
    "GeolocateControl.FindMyLocation": "Определить моё местоположение",
    "GeolocateControl.LocationNotAvailable": "Геолокация недоступна",
    "LogoControl.Title": "Логотип MapLibre",
    "Map.Title": "Интерактивная карта",
    "Marker.Title": "Маркер на карте",
    "NavigationControl.ResetBearing": "Повернуть на север",
    "NavigationControl.ZoomIn": "Приблизить",
    "NavigationControl.ZoomOut": "Отдалить",
    "Popup.Close": "Закрыть окно",
    "ScaleControl.Feet": "фт",
    "ScaleControl.Meters": "м",
    "ScaleControl.Kilometers": "км",
    "ScaleControl.Miles": "миль",
    "ScaleControl.NauticalMiles": "мор. миль",
    "GlobeControl.Enable": "Включить режим глобуса",
    "GlobeControl.Disable": "Выключить режим глобуса",
    "TerrainControl.Enable": "Включить рельеф",
    "TerrainControl.Disable": "Выключить рельеф",
    "CooperativeGesturesHandler.WindowsHelpText": "Используйте Ctrl + прокрутку для масштаба карты",
    "CooperativeGesturesHandler.MacHelpText": "Используйте ⌘ + прокрутку для масштаба карты",
    "CooperativeGesturesHandler.MobileHelpText": "Перемещайте карту двумя пальцами",
  },
  en: {
    "AttributionControl.ToggleAttribution": "Toggle attribution",
    "AttributionControl.MapFeedback": "Map feedback",
    "FullscreenControl.Enter": "Enter fullscreen",
    "FullscreenControl.Exit": "Exit fullscreen",
    "GeolocateControl.FindMyLocation": "Find my location",
    "GeolocateControl.LocationNotAvailable": "Location not available",
    "LogoControl.Title": "MapLibre logo",
    "Map.Title": "Map",
    "Marker.Title": "Map marker",
    "NavigationControl.ResetBearing": "Drag to rotate map, click to reset north",
    "NavigationControl.ZoomIn": "Zoom in",
    "NavigationControl.ZoomOut": "Zoom out",
    "Popup.Close": "Close popup",
    "ScaleControl.Feet": "ft",
    "ScaleControl.Meters": "m",
    "ScaleControl.Kilometers": "km",
    "ScaleControl.Miles": "mi",
    "ScaleControl.NauticalMiles": "nm",
    "GlobeControl.Enable": "Enable globe",
    "GlobeControl.Disable": "Disable globe",
    "TerrainControl.Enable": "Enable terrain",
    "TerrainControl.Disable": "Disable terrain",
    "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll to zoom the map",
    "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll to zoom the map",
    "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map",
  },
  ro: {
    "AttributionControl.ToggleAttribution": "Afișează sau ascunde sursele hărții",
    "AttributionControl.MapFeedback": "Raportează o eroare pe hartă",
    "FullscreenControl.Enter": "Pe tot ecranul",
    "FullscreenControl.Exit": "Ieși din ecran complet",
    "GeolocateControl.FindMyLocation": "Găsește locația mea",
    "GeolocateControl.LocationNotAvailable": "Locația nu este disponibilă",
    "LogoControl.Title": "Sigla MapLibre",
    "Map.Title": "Hartă interactivă",
    "Marker.Title": "Marcator pe hartă",
    "NavigationControl.ResetBearing": "Resetează orientarea spre nord",
    "NavigationControl.ZoomIn": "Mărește",
    "NavigationControl.ZoomOut": "Micșorează",
    "Popup.Close": "Închide fereastra",
    "ScaleControl.Feet": "ft",
    "ScaleControl.Meters": "m",
    "ScaleControl.Kilometers": "km",
    "ScaleControl.Miles": "mi",
    "ScaleControl.NauticalMiles": "nm",
    "GlobeControl.Enable": "Activează globul",
    "GlobeControl.Disable": "Dezactivează globul",
    "TerrainControl.Enable": "Activează relieful",
    "TerrainControl.Disable": "Dezactivează relieful",
    "CooperativeGesturesHandler.WindowsHelpText": "Folosește Ctrl + scroll pentru a mări harta",
    "CooperativeGesturesHandler.MacHelpText": "Folosește ⌘ + scroll pentru a mări harta",
    "CooperativeGesturesHandler.MobileHelpText": "Folosește două degete pentru a muta harta",
  },
};

export function getMapLibreLocale(locale: LocaleCode): Record<string, string> {
  return MAPLIBRE_LOCALES[locale] ?? MAPLIBRE_LOCALES.ru;
}

function basemapTextFieldExpression(locale: LocaleCode) {
  if (locale === "ru") {
    return ["coalesce", ["get", "name:ru"], ["get", "name"], ["get", "name:latin"]];
  }
  if (locale === "ro") {
    return ["coalesce", ["get", "name:ro"], ["get", "name"], ["get", "name:latin"]];
  }
  return ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
}

export function applyMapLibreLocalization(
  map: maplibregl.Map,
  locale: LocaleCode,
): void {
  const dict = getMapLibreLocale(locale);
  const internalMap = map as maplibregl.Map & { _locale?: Record<string, string> };
  if (internalMap._locale) {
    Object.assign(internalMap._locale, dict);
  }

  const container = map.getContainer();
  const controlMappings: Array<[string, string]> = [
    [".maplibregl-ctrl-zoom-in", "NavigationControl.ZoomIn"],
    [".maplibregl-ctrl-zoom-out", "NavigationControl.ZoomOut"],
    [".maplibregl-ctrl-compass", "NavigationControl.ResetBearing"],
    [".maplibregl-ctrl-fullscreen", "FullscreenControl.Enter"],
    [".maplibregl-ctrl-shrink", "FullscreenControl.Exit"],
    [".maplibregl-ctrl-geolocate", "GeolocateControl.FindMyLocation"],
    [".maplibregl-ctrl-attrib-button", "AttributionControl.ToggleAttribution"],
    [".maplibregl-popup-close-button", "Popup.Close"],
  ];

  for (const [selector, key] of controlMappings) {
    const label = dict[key];
    if (!label) continue;
    container.querySelectorAll(selector).forEach((el) => {
      el.setAttribute("aria-label", label);
      el.setAttribute("title", label);
    });
  }

  const canvas = container.querySelector(".maplibregl-canvas");
  if (canvas && dict["Map.Title"]) {
    canvas.setAttribute("aria-label", dict["Map.Title"]);
  }

  if (!map.isStyleLoaded()) return;

  const style = map.getStyle();
  if (!style?.layers) return;

  const textField = basemapTextFieldExpression(locale);
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    if (layer.id.startsWith("seatiko-") || layer.id.startsWith("highway-shield")) continue;
    if (layer.source !== "openmaptiles") continue;
    const layout = layer.layout as Record<string, unknown> | undefined;
    if (!layout || !("text-field" in layout)) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", textField);
    } catch {
      // Skip layers that reject layout updates while tiles/style settle
    }
  }
}

