"use client";

import { useMemo, useState } from "react";
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
  const [prefs, setPrefs] = useState<DiscoverPreferences>(initial);
  const [stepIndex, setStepIndex] = useState(0);

  const filtered = hasAnyPreference(prefs);

  function resetPreferences() {
    setPrefs(emptyPreferences());
    setStepIndex(0);
  }

  function editPreferences() {
    scrollToId("discover-top");
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
            onPrefsChange={setPrefs}
            onStepChange={setStepIndex}
            onGoToMap={() => scrollToId("discover-map")}
          />
          <GuidedChat
            prefs={prefs}
            onPrefsChange={setPrefs}
            collapsedDefault={true}
          />
        </div>
        <PreferenceSummary
          canReset={filtered}
          onReset={resetPreferences}
        />

        <section className="discover-map-section" id="discover-map">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">{copy.filtersActive}</span>
              <h2>{copy.mapTitle}</h2>
            </div>
            <p>{copy.mapBody}</p>
          </div>
          {filtered && (
            <ActiveFiltersBar
              prefs={prefs}
              onEdit={editPreferences}
              onClear={resetPreferences}
            />
          )}
          <VenueMap preferences={filtered ? prefs : undefined} />
        </section>
      </main>
    </div>
  );
}
