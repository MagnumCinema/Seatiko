"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { VenueMap } from "@/components/venue-map";

export default function BusinessPage() {
  return (
    <div className="business-page business-premium">
      <SiteHeader />
      <main>
        <section className="business-hero">
          <div className="business-hero-copy">
            <span className="eyebrow">FoodAssistant для бизнеса</span>
            <h1>Ваш зал работает.<br /><em>Даже когда вы не в зале.</em></h1>
            <p>Единый кабинет для публикации ресторана, броней, загрузки зала и цифрового сервиса. Больше видимости для гостей — больше контроля для команды.</p>
            <div className="landing-ctas">
              <Link href="/register" className="btn btn-gold">Подключить ресторан <span>→</span></Link>
              <Link href="/login" className="btn btn-outline">Войти в кабинет</Link>
            </div>
            <div className="business-proof"><span>✓ Без установки оборудования</span><span>✓ Запуск за 1 рабочий день</span><span>✓ Поддержка RU · RO · EN</span></div>
          </div>

          <div className="dashboard-preview" aria-label="Пример кабинета ресторана">
            <div className="dashboard-topbar"><div><span className="site-brand-mark">F</span><b>Restaurant OS</b></div><span>Сегодня · 18 июня</span></div>
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
          <div className="section-heading centered"><span className="eyebrow">Всё необходимое для роста</span><h2>Технологии остаются в фоне.<br />Гостеприимство — на первом месте.</h2></div>
          <div className="benefit-grid">
            <article><span>01</span><h3>Ваш ресторан на карте</h3><p>После модерации профиль появляется у гостей с адресом, кухней, рейтингом и свободными столами.</p></article>
            <article><span>02</span><h3>Контроль загрузки</h3><p>Понятный план зала и статусы столов помогают команде быстрее принимать решения.</p></article>
            <article><span>03</span><h3>Цифровой сервис</h3><p>QR-меню, заказ и вызов официанта сокращают ожидание, не заменяя человеческий контакт.</p></article>
            <article><span>04</span><h3>Возвращаемость гостей</h3><p>История визитов и персональные сценарии помогают строить долгие отношения.</p></article>
          </div>
        </section>

        <section className="business-map-block">
          <div className="section-heading split"><div><span className="eyebrow">Видимость с первого дня</span><h2>Зарегистрировались —<br />появились на карте</h2></div><p>Вы заполняете профиль и отправляете его на модерацию. После публикации точка ресторана автоматически становится доступна гостям на сайте и в мобильном приложении.</p></div>
          <VenueMap compact />
        </section>

        <section className="business-final-cta">
          <span className="eyebrow">Начните с первого заведения</span><h2>Покажите гостям,<br />что вы уже рядом.</h2><p>Создание профиля бесплатно для пилотных ресторанов Бельц.</p><Link href="/register" className="btn btn-light">Создать профиль ресторана <span>→</span></Link>
        </section>
      </main>
    </div>
  );
}
