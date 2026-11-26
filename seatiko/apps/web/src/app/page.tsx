"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VenueMap } from "@/components/venue-map";
import { ActiveFiltersBar } from "@/components/discover/active-filters-bar";
import { useLocale } from "@/components/locale-provider";
import {
  decodePreferences,
  hasAnyPreference,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";

function HomeMapSection() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).home;
  const searchParams = useSearchParams();
  const prefs = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const filtered = hasAnyPreference(prefs);

  return (
    <section className="landing-map-section" id="map">
      <div className="section-heading split">
        <div>
          <span className="eyebrow">{copy.mapEyebrow}</span>
          <h2 style={{ whiteSpace: "pre-line" }}>{copy.mapTitle}</h2>
        </div>
        <p>{copy.mapBody}</p>
      </div>
      {filtered && <ActiveFiltersBar prefs={prefs} />}
      <VenueMap preferences={filtered ? prefs : undefined} />
    </section>
  );
}

function scrollToSection(id: "map" | "how") {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${id}`);
}

const FEATURE_ICONS = [
  (
    <svg key="search" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  (
    <svg key="table" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.75" />
      <circle cx="15" cy="9" r="1.75" />
      <circle cx="9" cy="15" r="1.75" />
      <circle cx="15" cy="15" r="1.75" />
    </svg>
  ),
  (
    <svg key="qr" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h6" />
    </svg>
  ),
  (
    <svg key="heart" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
];

export default function HomePage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).home;

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash !== "map" && hash !== "how") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="landing">
      <SiteHeader variant="transparent" />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="hero-live-badge"><i /> {copy.liveBadge}</div>
          <h1 style={{ whiteSpace: "pre-line" }}>{copy.title} <em>{copy.titleAccent}</em></h1>
          <p className="landing-lead">
            {copy.leadShort}
          </p>
          <div className="landing-ctas">
            <Link href="/venues" className="btn btn--primary btn--lg">
              {copy.find} <span aria-hidden>→</span>
            </Link>
            <a
              href="#map"
              className="btn btn--secondary btn--lg btn-hero-map"
              onClick={(event) => {
                event.preventDefault();
                scrollToSection("map");
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              <span>{copy.browseMap}</span>
            </a>
          </div>
          {/* Platform figures stay fixed until the public stats API exists (BACKEND_TASKS №57). */}
          <div className="hero-trust">
            <span><strong>4.7</strong> {copy.rating}</span>
            <span><strong>24/7</strong> {copy.booking247}</span>
          </div>
        </div>

        <div className="landing-visual">
          <div className="hero-image" />
          <a
            href="#map"
            className="hero-floating-card hero-booking-card"
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("map");
            }}
          >
            <span className="hero-card-icon" aria-hidden="true">⌖</span>
            <span className="hero-card-text">
              <strong>{copy.heroCard1Title}</strong>
              <small>{copy.heroCard1Body}</small>
            </span>
            <span className="hero-card-arrow" aria-hidden="true">→</span>
          </a>
          <a
            href="#how"
            className="hero-floating-card hero-table-card"
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("how");
            }}
          >
            <span className="hero-card-icon" aria-hidden="true">QR</span>
            <span className="hero-card-text">
              <strong>{copy.heroCard2Title}</strong>
              <small>{copy.heroCard2Body}</small>
            </span>
            <span className="hero-card-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section className="landing-features" id="how">
        <div className="section-heading centered">
          <span className="eyebrow">{copy.serviceEyebrow}</span>
          <h2>{copy.serviceTitle}</h2>
          <p>{copy.serviceBody}</p>
        </div>

        {/* Before / After comparison */}
        <div className="compare-block">
          <div className="compare-col compare-old">
            <span className="compare-label compare-label-old">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {copy.compareOldLabel}
            </span>
            <ol className="compare-steps">
              {copy.compareOld.map((step) => (
                <li key={step}>
                  <span className="compare-dot compare-dot-old" />
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="compare-col compare-new">
            <span className="compare-label compare-label-new">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              {copy.compareNewLabel}
            </span>
            <ol className="compare-steps">
              {copy.compareNew.map((step) => (
                <li key={step}>
                  <span className="compare-dot compare-dot-new" />
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="feature-list">
          {copy.features.map(([title, body], index) => (
            <article key={title} className="feature-item">
              <div className="feature-item-head">
                <span className="feature-icon">{FEATURE_ICONS[index]}</span>
                <span className="feature-num">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <HomeMapSection />
      </Suspense>

      <section className="owner-cta">
        <div className="owner-cta-content">
          <div className="owner-kicker">
            <span className="owner-kicker-dot" aria-hidden="true" />
            <span>{copy.ownerEyebrow}</span>
          </div>
          <h2 style={{ whiteSpace: "pre-line" }}>{copy.ownerTitle}</h2>
          <p>{copy.ownerBody}</p>

          <div className="owner-cta-actions">
            <Link href="/register" className="btn btn--primary btn--lg">
              <span>{copy.ownerAction}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link href="/business" className="btn btn--secondary btn--lg">
              <span>{copy.ownerLearnMore}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="owner-trust-row">
            {copy.ownerTrust.map((item, i) => (
              <span key={i} className="owner-trust-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{item}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="owner-stats-panel">
          <div className="owner-stats-header">
            <span className="owner-stats-badge">{copy.ownerStatsBadge}</span>
            <span className="owner-stats-sub">{copy.ownerStatsSub}</span>
          </div>
          {/* +28% / −35% / venue count: fixed copy until BACKEND_TASKS №57 (public platform stats). */}
          <div className="owner-stats-grid">
            <div className="owner-stat-card">
              <span className="owner-stat-icon growth">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </span>
              <div className="owner-stat-body">
                <div className="owner-stat-top">
                  <strong className="owner-stat-number">+28%</strong>
                  <span className="owner-stat-tag growth">{copy.ownerTagGrowth}</span>
                </div>
                <span className="owner-stat-label">{copy.repeat}</span>
              </div>
            </div>

            <div className="owner-stat-card">
              <span className="owner-stat-icon efficiency">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
              <div className="owner-stat-body">
                <div className="owner-stat-top">
                  <strong className="owner-stat-number">−35%</strong>
                  <span className="owner-stat-tag efficiency">{copy.ownerTagSave}</span>
                </div>
                <span className="owner-stat-label">{copy.missed}</span>
              </div>
            </div>

            <div className="owner-stat-card owner-stat-highlight">
              <span className="owner-stat-icon control">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </span>
              <div className="owner-stat-body">
                <div className="owner-stat-top">
                  <strong className="owner-stat-number">{copy.oneCabinet}</strong>
                  <span className="owner-stat-tag control">{copy.ownerTagControl}</span>
                </div>
                <span className="owner-stat-label">{copy.oneCabinetBody}</span>
              </div>
            </div>
          </div>

          <div className="owner-stats-footer">
            <div className="owner-status-pulse">
              <span className="pulse-dot" aria-hidden="true" />
              <span>{copy.ownerLiveCount}</span>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
