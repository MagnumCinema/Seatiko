"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VenueMap } from "@/components/venue-map";
import { useLocale, type Locale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

/* Mini SVG icons matching the redesigned owner cabinet */
function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function LayoutGridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CalendarClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ListMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

type PreviewTab = "overview" | "shifts" | "floor";

const DASHBOARD_MOCK: Record<
  Locale,
  {
    previewAria: string;
    workspaceLabel: string;
    publishedBadge: string;
    today: string;
    greeting: string;
    overview: string;
    tabs: {
      overview: string;
      shifts: string;
      floor: string;
      menu: string;
      staff: string;
    };
    metrics: [
      { label: string; value: string; note: string },
      { label: string; value: string; note: string },
      { label: string; value: string; note: string },
      { label: string; value: string; note: string },
    ];
    floorTitle: string;
    floorFree: string;
    floorZones: [string, string, string];
    bookingsTitle: string;
    confirmedLabel: string;
    pendingLabel: string;
    guestLabel: (count: number) => string;
    shiftsTitle: string;
    swapAlert: string;
    days: [string, string, string, string, string];
    waitersRole: string;
    cooksRole: string;
  }
> = {
  ru: {
    previewAria: "Актуальный интерфейс кабинета владельца Seatiko",
    workspaceLabel: "Кабинет владельца",
    publishedBadge: "Опубликовано",
    today: "La Plăcinte · Сегодня",
    greeting: "Обзор заведения",
    overview: "Смены, зал и брони в реальном времени",
    tabs: {
      overview: "Обзор",
      shifts: "График смен",
      floor: "План зала",
      menu: "Меню",
      staff: "Персонал",
    },
    metrics: [
      { label: "Свободно сейчас", value: "9 / 14", note: "столов готовы" },
      { label: "Брони сегодня", value: "28", note: "+14% за неделю" },
      { label: "На смене", value: "6 / 8", note: "4 официанта · 2 повара" },
      { label: "Меню активно", value: "42", note: "2 в стоп-листе" },
    ],
    floorTitle: "План зала",
    floorFree: "9 свободно",
    floorZones: ["Зал", "Терраса", "Улица"],
    bookingsTitle: "Ближайшие брони",
    confirmedLabel: "Подтверждена",
    pendingLabel: "Ожидает",
    guestLabel: (count) => (count >= 5 ? `${count} гостей` : `${count} гостя`),
    shiftsTitle: "Недельная матрица смен",
    swapAlert: "1 запрос замены",
    days: ["Пн", "Вт", "Ср", "Чт", "Пт"],
    waitersRole: "Официанты",
    cooksRole: "Повара",
  },
  en: {
    previewAria: "Live preview of the Seatiko owner cabinet",
    workspaceLabel: "Owner cabinet",
    publishedBadge: "Published",
    today: "La Plăcinte · Today",
    greeting: "Venue overview",
    overview: "Shifts, floor plan & bookings live",
    tabs: {
      overview: "Overview",
      shifts: "Shift roster",
      floor: "Floor plan",
      menu: "Menu",
      staff: "Team",
    },
    metrics: [
      { label: "Free right now", value: "9 / 14", note: "tables open" },
      { label: "Bookings today", value: "28", note: "+14% vs last week" },
      { label: "On shift", value: "6 / 8", note: "4 waiters · 2 cooks" },
      { label: "Active menu", value: "42", note: "2 in stop-list" },
    ],
    floorTitle: "Floor plan",
    floorFree: "9 available",
    floorZones: ["Hall", "Terrace", "Street"],
    bookingsTitle: "Upcoming bookings",
    confirmedLabel: "Confirmed",
    pendingLabel: "Pending",
    guestLabel: (count) => (count === 1 ? `${count} guest` : `${count} guests`),
    shiftsTitle: "Weekly staff roster matrix",
    swapAlert: "1 swap request",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    waitersRole: "Waiters",
    cooksRole: "Cooks",
  },
  ro: {
    previewAria: "Previzualizarea actualizată a cabinetului Seatiko",
    workspaceLabel: "Cabinet proprietar",
    publishedBadge: "Publicat",
    today: "La Plăcinte · Azi",
    greeting: "Prezentare local",
    overview: "Ture, plan sală și rezervări în timp real",
    tabs: {
      overview: "Prezentare",
      shifts: "Program ture",
      floor: "Plan sală",
      menu: "Meniu",
      staff: "Echipă",
    },
    metrics: [
      { label: "Libere acum", value: "9 / 14", note: "mese disponibile" },
      { label: "Rezervări azi", value: "28", note: "+14% săptămâna aceasta" },
      { label: "În tură", value: "6 / 8", note: "4 ospătari · 2 bucătari" },
      { label: "Meniu activ", value: "42", note: "2 în stop-list" },
    ],
    floorTitle: "Plan sală",
    floorFree: "9 libere",
    floorZones: ["Sală", "Terasă", "Stradă"],
    bookingsTitle: "Rezervări viitoare",
    confirmedLabel: "Confirmată",
    pendingLabel: "În așteptare",
    guestLabel: (count) => (count === 1 ? `${count} oaspete` : `${count} oaspeți`),
    shiftsTitle: "Matrice săptămânală de ture",
    swapAlert: "1 cerere schimb",
    days: ["Lun", "Mar", "Mie", "Joi", "Vin"],
    waitersRole: "Ospătari",
    cooksRole: "Bucătari",
  },
};

export default function BusinessPage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).business;
  const mock = DASHBOARD_MOCK[locale] ?? DASHBOARD_MOCK.ru;
  const [previewTab, setPreviewTab] = useState<PreviewTab>("overview");

  return (
    <div className="landing business-premium">
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
            aria-label={mock.previewAria}
          >
            <div className="dashboard-topbar">
              <div>
                <span className="site-brand-mark">S</span>
                <b>Seatiko</b>
                <span className="dashboard-topbar-role">{mock.workspaceLabel}</span>
              </div>
              <div className="dashboard-topbar-meta">
                <span className="dashboard-status-pill">
                  <i /> {mock.publishedBadge}
                </span>
                <span>{mock.today}</span>
              </div>
            </div>

            <div className="dashboard-body">
              <aside aria-label={mock.workspaceLabel}>
                <button
                  type="button"
                  className={`dashboard-nav-btn ${previewTab === "overview" ? "on" : ""}`}
                  onClick={() => setPreviewTab("overview")}
                >
                  <HomeIcon />
                  <span>{mock.tabs.overview}</span>
                </button>
                <button
                  type="button"
                  className={`dashboard-nav-btn ${previewTab === "shifts" ? "on" : ""}`}
                  onClick={() => setPreviewTab("shifts")}
                >
                  <CalendarClockIcon />
                  <span>{mock.tabs.shifts}</span>
                  <em className="dashboard-nav-badge">1</em>
                </button>
                <button
                  type="button"
                  className={`dashboard-nav-btn ${previewTab === "floor" ? "on" : ""}`}
                  onClick={() => setPreviewTab("floor")}
                >
                  <LayoutGridIcon />
                  <span>{mock.tabs.floor}</span>
                </button>
                <span className="dashboard-nav-btn static">
                  <ListMenuIcon />
                  <span>{mock.tabs.menu}</span>
                </span>
                <span className="dashboard-nav-btn static">
                  <UsersIcon />
                  <span>{mock.tabs.staff}</span>
                </span>
              </aside>

              <div className="dashboard-content">
                <div className="dashboard-greeting">
                  <div>
                    <span>{mock.greeting}</span>
                    <strong>{mock.overview}</strong>
                  </div>
                  <span className="dashboard-swap-chip">{mock.swapAlert}</span>
                </div>

                <div className="dashboard-metrics">
                  {mock.metrics.map((metric) => (
                    <article key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                      <small>{metric.note}</small>
                    </article>
                  ))}
                </div>

                {previewTab === "shifts" ? (
                  <div className="dashboard-shifts-card">
                    <div className="dashboard-card-head">
                      <strong>{mock.shiftsTitle}</strong>
                      <span>{mock.waitersRole} · {mock.cooksRole}</span>
                    </div>
                    <div className="dashboard-roster-grid">
                      <span className="roster-h" />
                      {mock.days.map((day) => (
                        <span key={day} className="roster-h">{day}</span>
                      ))}

                      <span className="roster-name">Alex R. <em>W</em></span>
                      <i className="shift-chip ok">10–18</i>
                      <i className="shift-chip ok">10–18</i>
                      <i className="shift-chip off">—</i>
                      <i className="shift-chip warn">14–22</i>
                      <i className="shift-chip ok">14–22</i>

                      <span className="roster-name">Elena M. <em>W</em></span>
                      <i className="shift-chip off">—</i>
                      <i className="shift-chip ok">12–22</i>
                      <i className="shift-chip ok">10–18</i>
                      <i className="shift-chip ok">10–18</i>
                      <i className="shift-chip off">—</i>

                      <span className="roster-name">Andrei C. <em>C</em></span>
                      <i className="shift-chip cook">09–19</i>
                      <i className="shift-chip off">—</i>
                      <i className="shift-chip cook">09–19</i>
                      <i className="shift-chip cook">09–19</i>
                      <i className="shift-chip cook">12–22</i>
                    </div>
                  </div>
                ) : (
                  <div className={`dashboard-lower ${previewTab === "floor" ? "focus-floor" : ""}`}>
                    <article className="mini-floor">
                      <div className="dashboard-card-head">
                        <strong>{mock.floorTitle}</strong>
                        <span className="mini-floor-pill">
                          <i /> {mock.floorFree}
                        </span>
                      </div>
                      <div className="mini-zones">
                        {mock.floorZones.map((zone, idx) => (
                          <span key={zone} className={idx === 0 ? "on" : ""}>{zone}</span>
                        ))}
                      </div>
                      <div className="mini-tables">
                        <i className="busy">11 · 4p</i>
                        <i>12 · 4p</i>
                        <i className="booked">14 · 6p</i>
                        <i>15 · 2p</i>
                        <i className="busy">16 · 4p</i>
                        <i>19 · 4p</i>
                      </div>
                    </article>

                    {previewTab !== "floor" ? (
                      <article className="mini-bookings">
                        <div className="dashboard-card-head">
                          <strong>{mock.bookingsTitle}</strong>
                        </div>
                        <div className="mini-booking-row">
                          <div>
                            <b>19:30</b>
                            <span>Maria P. · {mock.guestLabel(4)}</span>
                          </div>
                          <em className="ok">{mock.confirmedLabel}</em>
                        </div>
                        <div className="mini-booking-row">
                          <div>
                            <b>20:00</b>
                            <span>Victor R. · {mock.guestLabel(2)}</span>
                          </div>
                          <em className="ok">{mock.confirmedLabel}</em>
                        </div>
                        <div className="mini-booking-row">
                          <div>
                            <b>20:15</b>
                            <span>Elena D. · {mock.guestLabel(6)}</span>
                          </div>
                          <em className="wait">{mock.pendingLabel}</em>
                        </div>
                      </article>
                    ) : (
                      <article className="mini-bookings">
                        <div className="dashboard-card-head">
                          <strong>{mock.shiftsTitle}</strong>
                        </div>
                        <div className="mini-booking-row">
                          <div>
                            <b>{mock.waitersRole}</b>
                            <span>Alex R., Elena M., Dan T.</span>
                          </div>
                          <em className="ok">10–22</em>
                        </div>
                        <div className="mini-booking-row">
                          <div>
                            <b>{mock.cooksRole}</b>
                            <span>Andrei C., Irina B.</span>
                          </div>
                          <em className="ok">09–22</em>
                        </div>
                      </article>
                    )}
                  </div>
                )}
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
