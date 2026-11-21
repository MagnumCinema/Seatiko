"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrency } from "@/components/currency-provider";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { ApiError, fetchMe, getToken } from "@/lib/api";
import {
  AUTH_CHANGE_EVENT,
  PROFILE_CHANGE_EVENT,
  headerAuthLink,
  headerUserName,
} from "@/lib/header-auth";
import type { BudgetCurrencyId } from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";

const LOCALES: Locale[] = ["ru", "en", "ro"];
const LOCALE_LABEL: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  ro: "RO",
};

type PrefMenu = "language" | "currency" | null;

function PrefDropdown({
  label,
  value,
  options,
  onChange,
  open,
  onOpenChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((option) => option.id === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className={`site-pref-dropdown${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="site-pref-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => onOpenChange(!open)}
      >
        <span>{current}</span>
        <span className="site-pref-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul className="site-pref-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.id === value;
            return (
              <li key={option.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={selected ? "on" : ""}
                  onClick={() => {
                    onChange(option.id);
                    onOpenChange(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

type Props = {
  variant?: "transparent" | "solid";
};

/** "account" = signed in, name not loaded yet (or API unreachable). */
type HeaderUser = { kind: "guest" } | { kind: "account" } | { kind: "user"; name: string };

/** Survives page navigations (each page mounts its own header), so the name doesn't flash. */
let cachedUser: { token: string; name: string } | null = null;

/** Only trusts the in-memory cache, so the first (SSR-hydrated) render is always "guest". */
function cachedHeaderUser(): HeaderUser {
  if (!cachedUser || getToken() !== cachedUser.token) return { kind: "guest" };
  return { kind: "user", name: cachedUser.name };
}

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
  const { currency, setCurrency, currencies } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const copy = getSiteCopy(locale).header;
  const pathname = usePathname();
  const router = useRouter();
  const [headerUser, setHeaderUser] = useState<HeaderUser>(cachedHeaderUser);
  const [openPref, setOpenPref] = useState<PrefMenu>(null);

  useEffect(() => {
    let alive = true;
    const sync = (refresh: boolean) => {
      const token = getToken();
      if (!token) {
        cachedUser = null;
        setHeaderUser({ kind: "guest" });
        return;
      }
      if (!refresh && cachedUser?.token === token) {
        setHeaderUser({ kind: "user", name: cachedUser.name });
        return;
      }
      fetchMe()
        .then((user) => {
          if (!alive || getToken() !== token) return;
          const name = headerUserName(user);
          cachedUser = name ? { token, name } : null;
          setHeaderUser(name ? { kind: "user", name } : { kind: "account" });
        })
        .catch((error) => {
          if (!alive) return;
          // Expired / revoked token: show "log in" instead of a dead profile link.
          setHeaderUser(
            error instanceof ApiError && error.status === 401 ? { kind: "guest" } : { kind: "account" },
          );
        });
    };
    const onPassive = () => sync(false);
    const onChange = () => sync(true);
    queueMicrotask(() => {
      if (alive) sync(false);
    });
    window.addEventListener("storage", onPassive);
    window.addEventListener("focus", onPassive);
    window.addEventListener(AUTH_CHANGE_EVENT, onChange);
    window.addEventListener(PROFILE_CHANGE_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener("storage", onPassive);
      window.removeEventListener("focus", onPassive);
      window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
      window.removeEventListener(PROFILE_CHANGE_EVENT, onChange);
    };
  }, [pathname]);

  const authed = headerUser.kind !== "guest";
  const authLink = headerAuthLink(authed);
  const authLabel =
    headerUser.kind === "user"
      ? headerUser.name
      : headerUser.kind === "account"
        ? copy.account
        : copy.login;

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
          <span className="site-brand-mark" aria-hidden>S</span>
          <span>Seatiko</span>
        </Link>
        <nav className="site-nav" aria-label={copy.nav}>
          <Link href="/venues" className="site-nav-link">
            {copy.catalog}
          </Link>
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
          <div className="site-prefs" role="group">
            <PrefDropdown
              label={copy.language}
              value={locale}
              options={LOCALES.map((id) => ({
                id,
                label: LOCALE_LABEL[id],
              }))}
              open={openPref === "language"}
              onOpenChange={(open) => setOpenPref(open ? "language" : null)}
              onChange={(id) => setLocale(id as Locale)}
            />
            <PrefDropdown
              label={copy.currency}
              value={currency}
              options={currencies.map((id) => ({ id, label: id }))}
              open={openPref === "currency"}
              onOpenChange={(open) => setOpenPref(open ? "currency" : null)}
              onChange={(id) => setCurrency(id as BudgetCurrencyId)}
            />
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
          <Link
            href={authLink.href}
            className="site-nav-login site-nav-primary"
            aria-label={headerUser.kind === "user" ? `${copy.account}: ${headerUser.name}` : authLabel}
            title={headerUser.kind === "user" ? headerUser.name : undefined}
          >
            <UserIcon />
            <span className="site-nav-user-name">{authLabel}</span>
            {authed && <span className="site-nav-online-dot" aria-hidden="true" />}
          </Link>
        </nav>
      </div>
    </header>
  );
}
