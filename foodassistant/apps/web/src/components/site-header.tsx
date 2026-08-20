"use client";

import Link from "next/link";
import { useLocale, type Locale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

type Props = {
  variant?: "transparent" | "solid";
};

export function SiteHeader({ variant = "solid" }: Props) {
  const { locale, setLocale } = useLocale();
  const copy = getSiteCopy(locale).header;

  return (
    <header className={`site-header ${variant}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <span className="site-brand-mark" aria-hidden>F</span>
          <span>FoodAssistant</span>
        </Link>
        <nav className="site-nav" aria-label={copy.nav}>
          <Link href="/#map">{copy.map}</Link>
          <Link href="/#how">{copy.how}</Link>
          <Link href="/business">{copy.business}</Link>
          <Link href="/demo">{copy.demo}</Link>
          <div className="site-lang" role="group" aria-label={copy.language}>
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
          <Link href="/login" className="site-nav-login">{copy.login}</Link>
          <Link href="/register" className="site-nav-cta">{copy.connect}</Link>
        </nav>
      </div>
    </header>
  );
}
