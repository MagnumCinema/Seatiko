"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { getToken } from "@/lib/api";
import { AUTH_CHANGE_EVENT, headerAuthLink } from "@/lib/header-auth";
import { getSiteCopy } from "@/lib/site-copy";

type Props = {
  variant?: "transparent" | "solid";
};

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SiteHeader({ variant = "solid" }: Props) {
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const copy = getSiteCopy(locale).header;
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(Boolean(getToken()));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
    };
  }, [pathname]);

  const authLink = headerAuthLink(authed);
  const authLabel = authLink.kind === "account" ? copy.account : copy.login;

  function goHomeSection(sectionId: "map" | "how") {
    if (pathname === "/") {
      scrollToId(sectionId);
      window.history.replaceState(null, "", `/#${sectionId}`);
      return;
    }
    router.push(`/#${sectionId}`);
  }

  return (
    <header className={`site-header ${variant}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <span className="site-brand-mark" aria-hidden>F</span>
          <span>FoodAssistant</span>
        </Link>
        <nav className="site-nav" aria-label={copy.nav}>
          <Link
            href="/#map"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("map");
            }}
          >
            {copy.map}
          </Link>
          <Link
            href="/#how"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("how");
            }}
          >
            {copy.how}
          </Link>
          <Link href="/business">{copy.business}</Link>
          <Link href="/book">{copy.book}</Link>
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
          <button
            type="button"
            className="site-theme-toggle"
            onClick={toggleTheme}
            aria-label={copy.theme}
          >
            {theme === "dark" ? copy.themeLight : copy.themeDark}
          </button>
          <Link href={authLink.href} className="site-nav-login">
            {authLabel}
          </Link>
          <Link href="/register" className="site-nav-cta">{copy.connect}</Link>
        </nav>
      </div>
    </header>
  );
}
