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
          FoodAssistant
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/business">Ресторанам</Link>
          <Link href="/demo">Демо</Link>
          <Link href="/login" className="site-nav-login">
            Войти
          </Link>
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
        </nav>
      </div>
    </header>
  );
}
