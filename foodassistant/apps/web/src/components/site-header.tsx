"use client";

import Link from "next/link";
import { useLocale, type Locale } from "@/components/locale-provider";

type Props = {
  variant?: "transparent" | "solid";
};

export function SiteHeader({ variant = "solid" }: Props) {
  const { locale, setLocale } = useLocale();

  return (
    <header className={`site-header ${variant}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <span className="site-brand-mark" aria-hidden>F</span>
          <span>FoodAssistant</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/#map">Карта</Link>
          <Link href="/#how">Как работает</Link>
          <Link href="/business">Для ресторанов</Link>
          <Link href="/demo">Демо</Link>
          <div className="site-lang" role="group" aria-label="Language">
            {(["ru", "en", "ro"] as Locale[]).map((l) => (
              <button
                key={l}
                type="button"
                className={locale === l ? "on" : ""}
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <Link href="/login" className="site-nav-login">Войти</Link>
          <Link href="/register" className="site-nav-cta">Подключить ресторан</Link>
        </nav>
      </div>
    </header>
  );
}
