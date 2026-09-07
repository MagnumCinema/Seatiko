"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { VenueMap } from "@/components/venue-map";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

export default function HomePage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).home;

  return (
    <div className="landing">
      <SiteHeader variant="transparent" />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="hero-live-badge"><i /> {copy.live}</div>
          <p className="landing-kicker">{copy.kicker}</p>
          <h1>{copy.title}<br /><em>{copy.titleAccent}</em></h1>
          <p className="landing-lead">
            {copy.lead}
          </p>
          <div className="landing-ctas">
            <Link href="/discover" className="btn btn-gold">
              {copy.find} <span>→</span>
            </Link>
            <Link href="#map" className="btn btn-outline">
              {copy.browseMap}
            </Link>
            <Link href="/business" className="btn btn-outline">
              {copy.connect}
            </Link>
          </div>
          <div className="hero-trust">
            <span><strong>3</strong> {copy.pilot}</span>
            <span><strong>4.7</strong> {copy.rating}</span>
            <span><strong>24/7</strong> {copy.booking247}</span>
          </div>
        </div>

        <div className="landing-visual">
          <div className="hero-image" />
          <div className="hero-floating-card hero-booking-card">
            <span className="hero-card-icon">⌖</span>
            <div>
              <small>{copy.heroCard1Title}</small>
              <strong>{copy.heroCard1Body}</strong>
            </div>
          </div>
          <div className="hero-floating-card hero-table-card">
            <span className="hero-table-dot" />
            <div>
              <strong>{copy.heroCard2Title}</strong>
              <small>{copy.heroCard2Body}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-map-section" id="map">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">{copy.mapEyebrow}</span>
            <h2 style={{ whiteSpace: "pre-line" }}>{copy.mapTitle}</h2>
          </div>
          <p>{copy.mapBody}</p>
        </div>
        <VenueMap />
      </section>

      <section className="landing-features" id="how">
        <div className="section-heading centered">
          <span className="eyebrow">{copy.serviceEyebrow}</span>
          <h2>{copy.serviceTitle}</h2>
          <p>{copy.serviceBody}</p>
        </div>
        <div className="feature-list">
          {copy.features.map(([title, body], index) => (
            <article key={title} className={`feature-item ${index === 1 ? "featured" : ""}`}>
              <span className="feature-icon">{["⌖", "◇", "▦", "♡"][index]}</span>
              <span className="feature-num">{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="owner-cta">
        <div>
          <span className="eyebrow">{copy.ownerEyebrow}</span>
          <h2 style={{ whiteSpace: "pre-line" }}>{copy.ownerTitle}</h2>
          <p>{copy.ownerBody}</p>
          <Link href="/register" className="btn btn-light">{copy.ownerAction} <span>→</span></Link>
        </div>
        <div className="owner-stats">
          <div><strong>+28%</strong><span>{copy.repeat}</span></div>
          <div><strong>−35%</strong><span>{copy.missed}</span></div>
          <div><strong>{copy.oneCabinet}</strong><span>{copy.oneCabinetBody}</span></div>
        </div>
      </section>

      <footer className="landing-footer">
        <Link href="/" className="footer-brand"><span className="site-brand-mark">F</span> FoodAssistant</Link>
        <span>{copy.slogan}</span>
        <div><Link href="/business">{copy.restaurants}</Link><Link href="/login">{getSiteCopy(locale).header.login}</Link></div>
      </footer>
    </div>
  );
}
