"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { GuidedChat } from "@/components/discover/guided-chat";
import { PreferenceStepper } from "@/components/discover/preference-stepper";
import {
  PreferenceSummary,
  buildMapHref,
} from "@/components/discover/preference-summary";
import {
  decodePreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

export function DiscoverWizard() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const [prefs, setPrefs] = useState(initial);
  const [stepIndex, setStepIndex] = useState(0);

  function showMap() {
    router.push(buildMapHref(prefs));
  }

  return (
    <div className="discover-page">
      <SiteHeader />
      <main className="discover-main">
        <header className="discover-hero">
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
        <PreferenceSummary prefs={prefs} onShowMap={showMap} />
      </main>
    </div>
  );
}
