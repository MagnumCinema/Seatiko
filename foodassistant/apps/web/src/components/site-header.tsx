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

function UserIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
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
          <Link href="/discover" className="site-nav-link">
            {copy.discover}
          </Link>
          <Link
            href="/#map"
            className="site-nav-link"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("map");
            }}
          >
            {copy.map}
          </Link>
          <Link href="/book" className="site-nav-link">
            {copy.book}
          </Link>
          <Link
            href="/#how"
            className="site-nav-link"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("how");
            }}
          >
            {copy.how}
          </Link>
          <Link href="/business" className="site-nav-secondary">
            {copy.business}
          </Link>
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
            title={theme === "dark" ? copy.themeLight : copy.themeDark}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link href={authLink.href} className="site-nav-login site-nav-primary">
            <UserIcon />
            <span>{authLabel}</span>
            {authed && <span className="site-nav-online-dot" aria-hidden="true" />}
          </Link>
        </nav>
      </div>
    </header>
  );
}
