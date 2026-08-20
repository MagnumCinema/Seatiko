"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { VenueMap } from "@/components/venue-map";

export default function HomePage() {
  return (
    <div className="landing">
      <SiteHeader variant="transparent" />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="hero-live-badge"><i /> Уже работает в Бельцах</div>
          <p className="landing-kicker">Новый стандарт гостеприимства</p>
          <h1>Ваш ресторан<br /><em>всегда рядом.</em></h1>
          <p className="landing-lead">
            Гости находят ресторан на карте, выбирают стол, бронируют и делают
            заказ. Вы управляете залом, меню и сервисом в одном пространстве.
          </p>
          <div className="landing-ctas">
            <Link href="#map" className="btn btn-gold">
              Найти ресторан <span>→</span>
            </Link>
            <Link href="/business" className="btn btn-outline">
              Подключить заведение
            </Link>
          </div>
          <div className="hero-trust">
            <span><strong>3</strong> заведения в пилоте</span>
            <span><strong>4.7</strong> средний рейтинг</span>
            <span><strong>24/7</strong> онлайн-бронирование</span>
          </div>
        </div>

        <div className="landing-visual">
          <div className="hero-image" />
          <div className="hero-floating-card hero-booking-card">
            <span className="hero-card-icon">✓</span>
            <div><small>Бронь подтверждена</small><strong>La Plăcinte · 19:30</strong></div>
          </div>
          <div className="hero-floating-card hero-table-card">
            <span className="hero-table-dot" />
            <div><strong>12 столов свободно</strong><small>данные обновлены сейчас</small></div>
          </div>
        </div>
      </section>

      <section className="landing-map-section" id="map">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">Живая карта города</span>
            <h2>Все лучшие места —<br />на одной карте</h2>
          </div>
          <p>Каждый ресторан после регистрации и модерации автоматически появляется на карте. Гости сразу видят рейтинг, средний чек и доступные столы.</p>
        </div>
        <VenueMap />
      </section>

      <section className="landing-features" id="how">
        <div className="section-heading centered">
          <span className="eyebrow">От первого касания до возвращения</span>
          <h2>Сервис, который чувствуется</h2>
          <p>Мы убрали лишние действия между желанием поужинать и идеальным столиком.</p>
        </div>
        <div className="feature-list">
          <article className="feature-item"><span className="feature-icon">⌖</span><span className="feature-num">01</span><h3>Найти место</h3><p>Карта ресторанов, фильтры по кухне, рейтингу и свободным столам.</p></article>
          <article className="feature-item featured"><span className="feature-icon">◇</span><span className="feature-num">02</span><h3>Выбрать стол</h3><p>Живой план зала показывает свободные столы и помогает выбрать лучший.</p></article>
          <article className="feature-item"><span className="feature-icon">▦</span><span className="feature-num">03</span><h3>Заказать по QR</h3><p>Меню, заказ и вызов официанта открываются прямо за вашим столом.</p></article>
          <article className="feature-item"><span className="feature-icon">♡</span><span className="feature-num">04</span><h3>Вернуться снова</h3><p>История заказов, любимые места и персональные предложения.</p></article>
        </div>
      </section>

      <section className="owner-cta">
        <div>
          <span className="eyebrow">Для владельцев ресторанов</span>
          <h2>Больше гостей.<br />Меньше пустых столов.</h2>
          <p>Создайте профиль заведения, добавьте фотографии и появитесь на карте после быстрой модерации.</p>
          <Link href="/register" className="btn btn-light">Зарегистрировать ресторан <span>→</span></Link>
        </div>
        <div className="owner-stats">
          <div><strong>+28%</strong><span>повторных визитов</span></div>
          <div><strong>−35%</strong><span>пропущенных броней</span></div>
          <div><strong>1 кабинет</strong><span>для зала и сервиса</span></div>
        </div>
      </section>

      <footer className="landing-footer">
        <Link href="/" className="footer-brand"><span className="site-brand-mark">F</span> FoodAssistant</Link>
        <span>Гостеприимство начинается до входа в ресторан.</span>
        <div><Link href="/business">Ресторанам</Link><Link href="/demo">Демо</Link><Link href="/login">Войти</Link></div>
      </footer>
    </div>
  );
}
