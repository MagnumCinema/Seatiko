"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { VenueMap } from "@/components/venue-map";
import { GuidedChat } from "@/components/discover/guided-chat";
import { PreferenceStepper } from "@/components/discover/preference-stepper";
import { ActiveFiltersBar } from "@/components/discover/active-filters-bar";
import {
  decodePreferences,
  emptyPreferences,
  encodePreferences,
  hasAnyPreference,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useCurrency } from "@/components/currency-provider";
import { useLocale } from "@/components/locale-provider";
import { useSearchParams } from "next/navigation";

/** Put the map canvas in the middle of the viewport (not the tall section bottom). */
function scrollMapIntoView() {
  const canvas =
    (document.querySelector(
      "#discover-map-view .venue-map-canvas",
    ) as HTMLElement | null) ??
    document.getElementById("discover-map-view") ??
    document.getElementById("discover-map");
  if (!canvas) return false;

  const rect = canvas.getBoundingClientRect();
  const headerOffset = 96;
  const usable = Math.max(240, window.innerHeight - headerOffset);
  // Aim the canvas midpoint at the middle of the usable viewport below the header.
  const targetY =
    window.scrollY +
    rect.top +
    rect.height / 2 -
    (headerOffset + usable / 2);

  window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
  return true;
}

function scheduleScrollToMap() {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (scrollMapIntoView() || attempts >= 12) return;
    window.setTimeout(tick, 50);
  };
  window.requestAnimationFrame(() => window.setTimeout(tick, 40));
}

export function DiscoverWizard() {
  const { locale } = useLocale();
  const { currency } = useCurrency();
  const copy = getSiteCopy(locale).discover;
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const [prefs, setPrefs] = useState<DiscoverPreferences>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [mapVisible, setMapVisible] = useState(hasAnyPreference(initial));
  const skipUrlSync = useRef(true);
  const pendingMapScroll = useRef(false);

  const filtered = hasAnyPreference(prefs);

  useEffect(() => {
    setPrefs((prev) =>
      prev.budgetCurrency === currency
        ? prev
        : { ...prev, budgetCurrency: currency },
    );
  }, [currency]);

  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    const qs = encodePreferences(prefs);
    const next = qs ? `/discover?${qs}` : "/discover";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [prefs]);

  useEffect(() => {
    if (!mapVisible || !pendingMapScroll.current) return;
    pendingMapScroll.current = false;
    scheduleScrollToMap();
  }, [mapVisible]);

  function handleStepChange(index: number) {
    setStepIndex(index);
    if (index >= 1) setMapVisible(true);
  }

  function goToMap() {
    if (mapVisible) {
      scheduleScrollToMap();
      return;
    }
    pendingMapScroll.current = true;
    setMapVisible(true);
  }

  function resetPreferences() {
    setPrefs(emptyPreferences());
    setStepIndex(0);
  }

  return (
    <div className="discover-page">
      <SiteHeader />
      <main className="discover-main">
        <header className="discover-hero" id="discover-top">
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>
        <div className="discover-layout">
          <PreferenceStepper
            stepIndex={stepIndex}
            prefs={prefs}
            mapVisible={mapVisible}
            onPrefsChange={setPrefs}
            onStepChange={handleStepChange}
            onGoToMap={goToMap}
          />
          <GuidedChat collapsedDefault={true} />
        </div>

        {stepIndex >= 1 || filtered || mapVisible ? (
          <ActiveFiltersBar
            prefs={prefs}
            onPrefsChange={setPrefs}
            onClear={resetPreferences}
            placement="under-stepper"
            stepIndex={mapVisible ? stepIndex + 1 : stepIndex}
          />
        ) : null}

        {mapVisible ? (
          <section className="discover-map-section" id="discover-map">
            <div className="section-heading split">
              <div>
                <h2>{copy.mapTitle}</h2>
              </div>
              <p>{copy.mapBody}</p>
            </div>
            <div id="discover-map-view">
              <VenueMap preferences={filtered ? prefs : undefined} />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
