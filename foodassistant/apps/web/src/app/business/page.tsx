"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function BusinessPage() {
  return (
    <div className="business-page">
      <SiteHeader />
      <div className="business-inner">
        <p className="landing-kicker">Для ресторанов</p>
        <h1>Подключите заведение к FoodAssistant</h1>
        <p className="business-lead">
          Подайте заявку онлайн: заполните карточку, загрузите фото, отправьте на
          модерацию. После публикации гости увидят вас в приложении и на карте
          пилота Бельцы.
        </p>
        <ul className="business-points">
          <li>
            <strong>Карточка заведения</strong> — название, кухня, адрес, часы,
            телефон.
          </li>
          <li>
            <strong>Модерация</strong> — проверка платформой перед публикацией.
          </li>
          <li>
            <strong>Гостевой поток</strong> — бронь, QR-сессия, меню и вызов
            официанта в Android-приложении.
          </li>
        </ul>
        <div className="landing-ctas">
          <Link href="/register" className="btn btn-gold">
            Зарегистрировать ресторан
          </Link>
          <Link href="/login" className="btn btn-outline">
            Уже есть аккаунт
          </Link>
        </div>
      </div>
    </div>
  );
}
