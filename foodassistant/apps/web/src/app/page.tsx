"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  const [guestNote, setGuestNote] = useState(false);

  return (
    <div className="landing">
      <SiteHeader variant="transparent" />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">Пилот · Бельцы</p>
          <h1>FoodAssistant</h1>
          <p className="landing-lead">
            Виртуальный инструмент для общепита: карта заведений, бронь стола,
            QR за столом и вызов официанта — без бумажной суеты.
          </p>
          <div className="landing-ctas">
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => setGuestNote((v) => !v)}
            >
              Для гостей
            </button>
            <Link href="/business" className="btn btn-outline">
              Для ресторанов
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Войти
            </Link>
          </div>
          {guestNote && (
            <div className="guest-note">
              <strong>Гостевое приложение — Android.</strong> Скачайте приложение
              FoodAssistant (скоро в магазине) или посмотрите{" "}
              <Link href="/demo">веб-демо</Link> потока гостя.{" "}
              <a href="#">Ссылка на APK</a> появится здесь.
            </div>
          )}
        </div>

        <div className="landing-visual" aria-hidden>
          <div className="landing-visual-bg" />
          <div className="landing-visual-glow" />
          <div className="landing-visual-overlay" />
          <p className="landing-visual-caption">
            Стол свободен.
            <br />
            Меню уже на телефоне.
          </p>
        </div>
      </section>

      <section className="landing-features">
        <h2>Как это работает</h2>
        <p>
          Один контур для гостя и заведения: от поиска места до оплаты за столом.
        </p>
        <div className="feature-list">
          <article className="feature-item">
            <span className="feature-num">01</span>
            <h3>Карта</h3>
            <p>Заведения Бельцы на карте: кухня, чек, свободные столы.</p>
          </article>
          <article className="feature-item">
            <span className="feature-num">02</span>
            <h3>Бронь</h3>
            <p>Выбор стола на плане зала и подтверждение визита.</p>
          </article>
          <article className="feature-item">
            <span className="feature-num">03</span>
            <h3>QR</h3>
            <p>Скан кода за столом открывает сессию и меню.</p>
          </article>
          <article className="feature-item">
            <span className="feature-num">04</span>
            <h3>Официант</h3>
            <p>Вызов персонала одной кнопкой — заказ, счёт, вопрос.</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        FoodAssistant · пилот Бельцы ·{" "}
        <Link href="/business">подключить ресторан</Link>
      </footer>
    </div>
  );
}
