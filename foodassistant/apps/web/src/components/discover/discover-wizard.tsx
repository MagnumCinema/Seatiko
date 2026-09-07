"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { VenueMap } from "@/components/venue-map";
import { GuidedChat } from "@/components/discover/guided-chat";
import { PreferenceStepper } from "@/components/discover/preference-stepper";
import { PreferenceSummary } from "@/components/discover/preference-summary";
import { ActiveFiltersBar } from "@/components/discover/active-filters-bar";
import {
  decodePreferences,
  emptyPreferences,
  hasAnyPreference,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";
import { useSearchParams } from "next/navigation";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DiscoverWizard() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const [prefs, setPrefs] = useState(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [mapVisible, setMapVisible] = useState(hasAnyPreference(initial));
  const [appliedPrefs, setAppliedPrefs] = useState<DiscoverPreferences | null>(
    hasAnyPreference(initial) ? initial : null,
  );

  useEffect(() => {
    if (mapVisible) {
      const t = window.setTimeout(() => scrollToId("discover-map"), 80);
      return () => window.clearTimeout(t);
    }
  }, [mapVisible, appliedPrefs]);

  function revealMap(next: DiscoverPreferences | null) {
    setAppliedPrefs(next);
    setMapVisible(true);
  }

  function showRecommendations() {
    revealMap(prefs);
  }

  function browseFullMap() {
    revealMap(null);
  }

  function clearMapFilters() {
    setPrefs(emptyPreferences());
    setAppliedPrefs(null);
    scrollToId("discover-map");
  }

  function editPreferences() {
    scrollToId("discover-top");
  }

  const filtered = Boolean(appliedPrefs && hasAnyPreference(appliedPrefs));

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
            onPrefsChange={setPrefs}
            onStepChange={setStepIndex}
          />
          <GuidedChat
            prefs={prefs}
            onPrefsChange={setPrefs}
            collapsedDefault={true}
          />
        </div>
        <PreferenceSummary
          prefs={prefs}
          onShowMap={showRecommendations}
          onBrowseMap={browseFullMap}
        />

        {mapVisible && (
          <section className="discover-map-section" id="discover-map">
            <div className="section-heading split">
              <div>
                <span className="eyebrow">{copy.filtersActive}</span>
                <h2>{copy.showMap}</h2>
              </div>
              <p>{copy.lead}</p>
            </div>
            {filtered && appliedPrefs && (
              <ActiveFiltersBar
                prefs={appliedPrefs}
                onEdit={editPreferences}
                onClear={clearMapFilters}
              />
            )}
            <VenueMap preferences={filtered ? appliedPrefs ?? undefined : undefined} />
          </section>
        )}
      </main>
    </div>
  );
}
