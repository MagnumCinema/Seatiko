"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useLocale } from "@/components/locale-provider";
import { ApiError, register } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";

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

function ShieldCheckIcon() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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

export default function RegisterPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).register;
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        ...form,
        locale,
        role: "restaurant",
      });
      router.replace("/cabinet");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "email_taken"
            ? copy.taken
            : err.code
          : copy.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  const isPasswordValid = form.password.length >= 6;

  return (
    <div className="auth-page owner-register-page">
      <SiteHeader />
      <main className="owner-register-shell">
        <section className="owner-register-story">
          <span className="owner-kicker">
            <span className="owner-kicker-dot" aria-hidden="true" />
            {copy.kicker}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>

          <ol className="owner-register-steps">
            {copy.steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>

          <div className="owner-register-trust">
            <div className="owner-trust-badge">
              <ClockIcon />
              <strong>{copy.review}</strong>
            </div>
            <div className="owner-trust-badge">
              <ShieldCheckIcon />
              <span>{copy.history}</span>
            </div>
          </div>
        </section>

        <section className="auth-card owner-register-card">
          <span className="owner-kicker">
            <span className="owner-kicker-dot" aria-hidden="true" />
            {copy.account}
          </span>
          <h2>{copy.connect}</h2>
          <p>{copy.intro}</p>

          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="owner-form-row">
              <div className="field">
                <label htmlFor="first_name">{copy.first}</label>
                <input
                  id="first_name"
                  required
                  autoComplete="given-name"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      first_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="last_name">{copy.last}</label>
                <input
                  id="last_name"
                  required
                  autoComplete="family-name"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      last_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">{copy.email}</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="owner@restaurant.md"
                value={form.email}
                onChange={(e) =>
                  setForm((current) => ({ ...current, email: e.target.value }))
                }
              />
            </div>
            <div className="field password-field-wrap">
              <label htmlFor="password">{copy.password}</label>
              <div className="password-input-row">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder={copy.passwordHint}
                  value={form.password}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      password: e.target.value,
                    }))
                  }
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
              {form.password.length > 0 && (
                <div
                  className={`password-strength-hint ${isPasswordValid ? "valid" : "invalid"}`}
                >
                  <span className="password-strength-dot" aria-hidden="true" />
                  <span>
                    {isPasswordValid
                      ? `✓ ${copy.passwordHint}`
                      : `${copy.passwordHint} (${form.password.length}/6)`}
                  </span>
                </div>
              )}
            </div>
            <p className="owner-form-legal">{copy.legal}</p>
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
              <span>{busy ? copy.creating : copy.continue}</span>
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
          </form>
          <p className="auth-links">
            {copy.exists} <Link href="/login?role=restaurant">{copy.login}</Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
