"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { VenueMap } from "@/components/venue-map";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

export default function BusinessPage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).business;

  return (
    <div className="business-page business-premium">
      <SiteHeader />
      <main>
        <section className="business-hero">
          <div className="business-hero-copy">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}<br /><em>{copy.accent}</em></h1>
            <p>{copy.body}</p>
            <div className="landing-ctas">
              <Link href="/register" className="btn btn-gold">{copy.connect} <span>→</span></Link>
              <Link href="/login?role=restaurant" className="btn btn-outline">{copy.cabinet}</Link>
            </div>
            <div className="business-proof">{copy.proofs.map((proof) => <span key={proof}>✓ {proof}</span>)}</div>
          </div>

          <div className="dashboard-preview" aria-label="Пример кабинета ресторана">
            <div className="dashboard-topbar"><div><span className="site-brand-mark">S</span><b>Restaurant OS</b></div><span>Сегодня · 18 июня</span></div>
            <div className="dashboard-body">
              <aside><i className="on">⌂</i><i>▦</i><i>◇</i><i>≡</i></aside>
              <div className="dashboard-content">
                <div className="dashboard-greeting"><span>Добрый вечер, Andrei</span><strong>Обзор ресторана</strong></div>
                <div className="dashboard-metrics">
                  <article><span>Брони сегодня</span><strong>28</strong><small>↑ 12% к прошлой неделе</small></article>
                  <article><span>Загрузка зала</span><strong>74%</strong><small>Пик ожидается в 20:00</small></article>
                  <article><span>Средний чек</span><strong>412 <small>MDL</small></strong><small>↑ 8% за месяц</small></article>
                </div>
                <div className="dashboard-lower">
                  <article className="mini-floor"><div><strong>Зал сейчас</strong><span><i /> 9 свободно</span></div><div className="mini-tables"><i className="busy">1</i><i>2</i><i className="booked">3</i><i>4</i><i className="busy">5</i><i>6</i></div></article>
                  <article className="mini-bookings"><strong>Ближайшие брони</strong><span><b>19:30</b> Maria P. · 4 гостя</span><span><b>20:00</b> Victor R. · 2 гостя</span><span><b>20:15</b> Elena D. · 6 гостей</span></article>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="business-benefits">
          <div className="section-heading centered"><span className="eyebrow">{copy.benefitsEyebrow}</span><h2 style={{ whiteSpace: "pre-line" }}>{copy.benefitsTitle}</h2></div>
          <div className="benefit-grid">
            {copy.benefits.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="business-map-block">
          <div className="section-heading split"><div><span className="eyebrow">{copy.mapEyebrow}</span><h2 style={{ whiteSpace: "pre-line" }}>{copy.mapTitle}</h2></div><p>{copy.mapBody}</p></div>
          <VenueMap compact />
        </section>

        <section className="business-final-cta">
          <span className="eyebrow">{copy.finalEyebrow}</span><h2 style={{ whiteSpace: "pre-line" }}>{copy.finalTitle}</h2><p>{copy.finalBody}</p><Link href="/register" className="btn btn-light">{copy.finalAction} <span>→</span></Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
