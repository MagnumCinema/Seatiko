"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useCurrency } from "@/components/currency-provider";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { NotificationsBell } from "@/components/notifications-bell";
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
type HeaderUser =
  | { kind: "guest" }
  | { kind: "account" }
  | { kind: "user"; name: string; role?: string };

/** Survives page navigations (each page mounts its own header), so the name doesn't flash. */
let cachedUser: { token: string; name: string; role?: string } | null = null;

/** Only trusts the in-memory cache, so the first (SSR-hydrated) render is always "guest". */
function cachedHeaderUser(): HeaderUser {
  if (!cachedUser || getToken() !== cachedUser.token) return { kind: "guest" };
  return { kind: "user", name: cachedUser.name, role: cachedUser.role };
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

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function isRouteActive(pathname: string, target: string): boolean {
  if (target === "/venues") {
    return pathname === "/venues" || pathname.startsWith("/venues/");
  }
  return pathname === target;
}

export function SiteHeader({ variant = "solid" }: Props) {
  const { locale, setLocale } = useLocale();
  const { currency, setCurrency, currencies } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const copy = getSiteCopy(locale).header;
  const pathname = usePathname();
  const router = useRouter();
  const mobileNavId = useId();
  const menuToggleRef = useRef<HTMLButtonElement | null>(null);
  const [headerUser, setHeaderUser] = useState<HeaderUser>(cachedHeaderUser);
  const [openPref, setOpenPref] = useState<PrefMenu>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncedPath, setSyncedPath] = useState(pathname);

  if (syncedPath !== pathname) {
    setSyncedPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

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
        setHeaderUser({ kind: "user", name: cachedUser.name, role: cachedUser.role });
        return;
      }
      fetchMe()
        .then((user) => {
          if (!alive || getToken() !== token) return;
          const name = headerUserName(user);
          cachedUser = name ? { token, name, role: user.role } : null;
          setHeaderUser(name ? { kind: "user", name, role: user.role } : { kind: "account" });
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
  const userRole = headerUser.kind === "user" ? headerUser.role : undefined;
  const authLink = headerAuthLink(authed, userRole);
  const authLabel =
    headerUser.kind === "user"
      ? headerUser.name
      : headerUser.kind === "account"
        ? copy.account
        : copy.login;

  const roleLink =
    userRole === "restaurant"
      ? {
          href: "/cabinet",
          label:
            locale === "en"
              ? "Venue Cabinet"
              : locale === "ro"
                ? "Cabinet Restaurant"
                : "Кабинет ресторана",
        }
      : userRole === "staff"
        ? {
            href: "/staff",
            label:
              locale === "en"
                ? "Staff Panel"
                : locale === "ro"
                  ? "Panou Personal"
                  : "Панель персонала",
          }
        : { href: "/business", label: copy.business };

  function goHomeSection(sectionId: "map" | "how") {
    setMobileOpen(false);
    if (pathname === "/") {
      scrollToId(sectionId);
      window.history.replaceState(null, "", `/#${sectionId}`);
      return;
    }
    router.push(`/#${sectionId}`);
  }

  return (
    <header className={`site-header ${variant}${mobileOpen ? " mobile-nav-open" : ""}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand" onClick={() => setMobileOpen(false)}>
          <span className="site-brand-mark" aria-hidden>S</span>
          <span>Seatiko</span>
        </Link>
        <nav className="site-nav" aria-label={copy.nav}>
          <Link
            href="/venues"
            className="site-nav-link"
            aria-current={isRouteActive(pathname, "/venues") ? "page" : undefined}
          >
            {copy.catalog}
          </Link>
          <Link
            href="/discover"
            className="site-nav-link"
            aria-current={isRouteActive(pathname, "/discover") ? "page" : undefined}
          >
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
          <Link
            href="/book"
            className="site-nav-link"
            aria-current={isRouteActive(pathname, "/book") ? "page" : undefined}
          >
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
          <Link
            href={roleLink.href}
            className="site-nav-secondary"
            aria-current={isRouteActive(pathname, roleLink.href) ? "page" : undefined}
          >
            {roleLink.label}
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
          {headerUser.kind === "user" && cachedUser ? (
            <NotificationsBell token={cachedUser.token} role={headerUser.role} />
          ) : null}
          <Link
            href={authLink.href}
            className="site-nav-login site-nav-primary"
            aria-label={headerUser.kind === "user" ? `${copy.account}: ${headerUser.name}` : authLabel}
            aria-current={isRouteActive(pathname, authLink.href) ? "page" : undefined}
            title={headerUser.kind === "user" ? headerUser.name : undefined}
          >
            <UserIcon />
            <span className="site-nav-user-name">{authLabel}</span>
            {authed && <span className="site-nav-online-dot" aria-hidden="true" />}
          </Link>

          <button
            ref={menuToggleRef}
            type="button"
            className="site-menu-toggle"
            aria-expanded={mobileOpen}
            aria-controls={mobileNavId}
            aria-label={mobileOpen ? copy.menuClose : copy.menuOpen}
            onClick={() => {
              setOpenPref(null);
              setMobileOpen((v) => !v);
            }}
          >
            {mobileOpen ? <CloseMenuIcon /> : <MenuIcon />}
          </button>

          {mobileOpen ? (
            <button
              type="button"
              className="site-mobile-backdrop"
              tabIndex={-1}
              aria-label={copy.menuClose}
              onClick={() => setMobileOpen(false)}
            />
          ) : null}

          <div
            id={mobileNavId}
            className="site-mobile-drawer"
            hidden={!mobileOpen}
          >
            <div className="site-mobile-drawer-head">
              <span className="site-mobile-drawer-title">{copy.menuTitle}</span>
              <button
                type="button"
                className="site-mobile-drawer-close"
                aria-label={copy.menuClose}
                onClick={() => {
                  setMobileOpen(false);
                  menuToggleRef.current?.focus();
                }}
              >
                <CloseMenuIcon />
              </button>
            </div>

            <div className="site-mobile-links">
              <Link
                href="/venues"
                className="site-mobile-link"
                aria-current={isRouteActive(pathname, "/venues") ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span>{copy.catalog}</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/discover"
                className="site-mobile-link"
                aria-current={isRouteActive(pathname, "/discover") ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span>{copy.discover}</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/book"
                className="site-mobile-link"
                aria-current={isRouteActive(pathname, "/book") ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span>{copy.book}</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/#map"
                className="site-mobile-link"
                onClick={(event) => {
                  event.preventDefault();
                  goHomeSection("map");
                }}
              >
                <span>{copy.map}</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/#how"
                className="site-mobile-link"
                onClick={(event) => {
                  event.preventDefault();
                  goHomeSection("how");
                }}
              >
                <span>{copy.how}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="site-mobile-ctas">
              <Link
                href={authLink.href}
                className="btn btn-gold site-mobile-cta"
                aria-current={isRouteActive(pathname, authLink.href) ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <UserIcon />
                <span>{authLabel}</span>
              </Link>
              <Link
                href={roleLink.href}
                className="btn btn-outline site-mobile-cta"
                aria-current={isRouteActive(pathname, roleLink.href) ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span>{roleLink.label}</span>
              </Link>
            </div>

            <div className="site-mobile-prefs">
              <div className="site-mobile-pref-row" role="group" aria-label={copy.language}>
                {LOCALES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`site-mobile-pill${locale === id ? " on" : ""}`}
                    aria-pressed={locale === id}
                    onClick={() => setLocale(id)}
                  >
                    {LOCALE_LABEL[id]}
                  </button>
                ))}
              </div>
              <div className="site-mobile-pref-row" role="group" aria-label={copy.currency}>
                {currencies.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`site-mobile-pill${currency === id ? " on" : ""}`}
                    aria-pressed={currency === id}
                    onClick={() => setCurrency(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
