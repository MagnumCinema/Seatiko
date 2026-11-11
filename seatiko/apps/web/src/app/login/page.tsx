"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ApiError, login, redirectPathForRole } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

function BuildingIcon() {
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
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
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

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).login;

  const roleParam = searchParams.get("role");
  const initialRole =
    roleParam === "restaurant" || roleParam === "business" || roleParam === "owner"
      ? "restaurant"
      : "guest";
  const [role, setRole] = useState<"restaurant" | "guest">(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSwitch = (newRole: "restaurant" | "guest") => {
    setRole(newRole);
    setError(null);
  };

  const handleQuickDemo = () => {
    setError(null);
    if (role === "restaurant") {
      setEmail("admin@seatiko.local");
      setPassword("admin123");
    } else {
      setEmail("guest@seatiko.local");
      setPassword("guest123");
    }
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login({ email, password });
      const next = searchParams.get("next");
      const fallback = redirectPathForRole(res.user.role);
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : fallback;
      router.replace(target);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "invalid_credentials"
            ? copy.invalid
            : err.code
          : copy.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  const isRestaurant = role === "restaurant";

  return (
    <div className="auth-card login-card">
      {/* Unobtrusive Segmented Role Switcher (Guest by default, Restaurant optional) */}
      <div
        className="login-role-switch"
        role="tablist"
        aria-label="Тип аккаунта"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!isRestaurant}
          className={`login-role-tab ${!isRestaurant ? "active" : ""}`}
          onClick={() => handleRoleSwitch("guest")}
        >
          <UserIcon />
          <span>{copy.tabGuest}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRestaurant}
          className={`login-role-tab ${isRestaurant ? "active" : ""}`}
          onClick={() => handleRoleSwitch("restaurant")}
        >
          <BuildingIcon />
          <span>{copy.tabRestaurant}</span>
        </button>
      </div>

      {/* Dynamic Header */}
      <div className="login-header">
        <span className="login-header-badge">
          {isRestaurant ? copy.tabRestaurant : copy.tabGuest}
        </span>
        <h1>{isRestaurant ? copy.restaurantTitle : copy.guestTitle}</h1>
        <p>{isRestaurant ? copy.restaurantBody : copy.guestBody}</p>
      </div>

      <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder={
              isRestaurant ? "owner@restaurant.md" : "guest@seatiko.local"
            }
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field password-field-wrap">
          <label htmlFor="password">{copy.password}</label>
          <div className="password-input-row">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder={copy.passwordHint}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Скрыть" : "Показать"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-gold btn-block"
          disabled={busy}
        >
          <span>{busy ? copy.busy : copy.action}</span>
          {!busy && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>

        {/* 1-Click Demo Credentials Fast-Fill */}
        <button
          type="button"
          className="btn-demo-chip"
          onClick={handleQuickDemo}
          title="Заполнить поля демонстрационными данными в 1 клик"
        >
          <FlashIcon />
          <span>
            {isRestaurant ? copy.fillDemoRestaurant : copy.fillDemoGuest}
          </span>
        </button>
      </form>

      {/* Demo Credentials Info Strip */}
      <div className="login-demo-details">
        <span>
          {isRestaurant ? "Демо-логин:" : "Демо-гость:"}{" "}
          <code>
            {isRestaurant
              ? "admin@seatiko.local"
              : "guest@seatiko.local"}
          </code>
        </span>
        <span>
          Пароль: <code>{isRestaurant ? "admin123" : "guest123"}</code>
        </span>
      </div>

      {/* Contextual Bottom Link */}
      <p className="auth-links">
        {isRestaurant ? (
          <>
            {copy.noAccount} <Link href="/register">{copy.register} →</Link>
          </>
        ) : (
          <>
            {copy.guestNoAccount}{" "}
            <Link href="/book">{copy.guestBrowse} →</Link>
          </>
        )}
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-page login-page">
      <SiteHeader />
      <main className="login-shell">
        <Suspense
          fallback={
            <div className="auth-card login-card">
              <p style={{ textAlign: "center", color: "var(--site-muted)" }}>
                Загрузка…
              </p>
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
