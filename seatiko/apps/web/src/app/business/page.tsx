"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VenueMap } from "@/components/venue-map";
import { useLocale, type Locale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

/* Mini SVG icons for dashboard aside mock */
function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function LayoutGridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 6.8L21 12l-6.6 3.2L12 22l-2.4-6.8L3 12l6.6-3.2z" />
    </svg>
  );
}

function ListMenuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/* 4 Semantic Benefit Icons */
function MapPinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function OccupancyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M6 8h4v4H6zM14 8h4v4h-4z" />
    </svg>
  );
}

function DigitalServiceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 21h3M21 14v3" />
    </svg>
  );
}

function GuestRetentionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8a3 3 0 0 1 3 3c0 2-3 4-3 4s-3-2-3-4a3 3 0 0 1 3-3z" />
    </svg>
  );
}

const BENEFIT_ICONS = [
  MapPinIcon,
  OccupancyIcon,
  DigitalServiceIcon,
  GuestRetentionIcon,
];

const DASHBOARD_MOCK: Record<
  Locale,
  {
    today: string;
    greeting: string;
    overview: string;
    metric1Label: string;
    metric1Trend: string;
    metric2Label: string;
    metric2Trend: string;
    metric3Label: string;
    metric3Trend: string;
    floorTitle: string;
    floorFree: string;
    bookingsTitle: string;
    guestLabel: (count: number) => string;
  }
> = {
  ru: {
    today: "Сегодня · 18 июня",
    greeting: "Добрый вечер, Andrei",
    overview: "Обзор ресторана",
    metric1Label: "Брони сегодня",
    metric1Trend: "↑ 12% к прошлой неделе",
    metric2Label: "Загрузка зала",
    metric2Trend: "Пик ожидается в 20:00",
    metric3Label: "Средний чек",
    metric3Trend: "↑ 8% за месяц",
    floorTitle: "Зал сейчас",
    floorFree: "9 свободно",
    bookingsTitle: "Ближайшие брони",
    guestLabel: (count) => (count >= 5 ? `${count} гостей` : `${count} гостя`),
  },
  en: {
    today: "Today · June 18",
    greeting: "Good evening, Andrei",
    overview: "Restaurant overview",
    metric1Label: "Bookings today",
    metric1Trend: "↑ 12% vs last week",
    metric2Label: "Floor occupancy",
    metric2Trend: "Peak expected at 20:00",
    metric3Label: "Average check",
    metric3Trend: "↑ 8% this month",
    floorTitle: "Floor live",
    floorFree: "9 available",
    bookingsTitle: "Upcoming bookings",
    guestLabel: (count) => (count === 1 ? `${count} guest` : `${count} guests`),
  },
  ro: {
    today: "Astăzi · 18 iunie",
    greeting: "Bună seara, Andrei",
    overview: "Prezentare generală",
    metric1Label: "Rezervări azi",
    metric1Trend: "↑ 12% față de săpt. trecută",
    metric2Label: "Grad de ocupare",
    metric2Trend: "Vârf estimat la 20:00",
    metric3Label: "Notă medie",
    metric3Trend: "↑ 8% luna aceasta",
    floorTitle: "Sala acum",
    floorFree: "9 libere",
    bookingsTitle: "Rezervări viitoare",
    guestLabel: (count) => (count === 1 ? `${count} oaspete` : `${count} oaspeți`),
  },
};

export default function BusinessPage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).business;
  const mock = DASHBOARD_MOCK[locale] ?? DASHBOARD_MOCK.ru;

  return (
    <div className="business-page business-premium">
      <SiteHeader variant="transparent" />
      <main>
        <section className="business-hero">
          <div className="business-hero-copy">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>
              {copy.title}
              <br />
              <em>{copy.accent}</em>
            </h1>
            <p>{copy.body}</p>
            <div className="landing-ctas">
              <Link href="/register" className="btn btn-gold">
                {copy.connect} <span>→</span>
              </Link>
              <Link href="/login?role=restaurant" className="btn btn-outline">
                {copy.cabinet}
              </Link>
            </div>
            <div className="business-proof">
              {copy.proofs.map((proof) => (
                <span key={proof}>
                  <b>✓</b> {proof}
                </span>
              ))}
            </div>
          </div>

          <div
            className="dashboard-preview"
            aria-label="Пример кабинета ресторана"
          >
            <div className="dashboard-topbar">
              <div>
                <span className="site-brand-mark">S</span>
                <b>Restaurant OS</b>
              </div>
              <span>{mock.today}</span>
            </div>
            <div className="dashboard-body">
              <aside>
                <span className="dashboard-nav-btn on" title="Home">
                  <HomeIcon />
                </span>
                <span className="dashboard-nav-btn" title="Tables">
                  <LayoutGridIcon />
                </span>
                <span className="dashboard-nav-btn" title="Stats">
                  <SparkleIcon />
                </span>
                <span className="dashboard-nav-btn" title="Menu">
                  <ListMenuIcon />
                </span>
              </aside>
              <div className="dashboard-content">
                <div className="dashboard-greeting">
                  <span>{mock.greeting}</span>
                  <strong>{mock.overview}</strong>
                </div>
                <div className="dashboard-metrics">
                  <article>
                    <span>{mock.metric1Label}</span>
                    <strong>28</strong>
                    <small>{mock.metric1Trend}</small>
                  </article>
                  <article>
                    <span>{mock.metric2Label}</span>
                    <strong>74%</strong>
                    <small>{mock.metric2Trend}</small>
                  </article>
                  <article>
                    <span>{mock.metric3Label}</span>
                    <strong>
                      412 <small>MDL</small>
                    </strong>
                    <small>{mock.metric3Trend}</small>
                  </article>
                </div>
                <div className="dashboard-lower">
                  <article className="mini-floor">
                    <div>
                      <strong>{mock.floorTitle}</strong>
                      <span>
                        <i /> {mock.floorFree}
                      </span>
                    </div>
                    <div className="mini-tables">
                      <i className="busy">1</i>
                      <i>2</i>
                      <i className="booked">3</i>
                      <i>4</i>
                      <i className="busy">5</i>
                      <i>6</i>
                    </div>
                  </article>
                  <article className="mini-bookings">
                    <strong>{mock.bookingsTitle}</strong>
                    <span>
                      <b>19:30</b> Maria P. · {mock.guestLabel(4)}
                    </span>
                    <span>
                      <b>20:00</b> Victor R. · {mock.guestLabel(2)}
                    </span>
                    <span>
                      <b>20:15</b> Elena D. · {mock.guestLabel(6)}
                    </span>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="business-benefits">
          <div className="section-heading centered">
            <span className="eyebrow">{copy.benefitsEyebrow}</span>
            <h2 style={{ whiteSpace: "pre-line" }}>{copy.benefitsTitle}</h2>
          </div>
          <div className="benefit-grid">
            {copy.benefits.map(([title, body], index) => {
              const Icon = BENEFIT_ICONS[index] ?? MapPinIcon;
              return (
                <article key={title} className="benefit-card">
                  <div className="benefit-card-head">
                    <div className="benefit-icon" aria-hidden="true">
                      <Icon />
                    </div>
                    <span className="benefit-num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="business-map-block">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">{copy.mapEyebrow}</span>
              <h2 style={{ whiteSpace: "pre-line" }}>{copy.mapTitle}</h2>
            </div>
            <p>{copy.mapBody}</p>
          </div>
          <VenueMap compact />
        </section>

        <section className="business-final-cta">
          <span className="eyebrow">{copy.finalEyebrow}</span>
          <h2 style={{ whiteSpace: "pre-line" }}>{copy.finalTitle}</h2>
          <p>{copy.finalBody}</p>
          <Link href="/register" className="btn btn-light">
            {copy.finalAction} <span>→</span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
