"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useLocale } from "@/components/locale-provider";
import { ApiError, register } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";

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

  return (
    <div className="auth-page owner-register-page">
      <SiteHeader />
      <main className="owner-register-shell">
        <section className="owner-register-story">
          <span className="owner-kicker">{copy.kicker}</span>
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
            <strong>{copy.review}</strong>
            <span>{copy.history}</span>
          </div>
        </section>

        <section className="auth-card owner-register-card">
          <span className="owner-kicker">{copy.account}</span>
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
            <div className="field">
              <label htmlFor="password">{copy.password}</label>
              <input
                id="password"
                type="password"
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
            </div>
            <p className="owner-form-legal">
              {copy.legal}
            </p>
            {error && <p className="auth-error">{error}</p>}
            <button
              type="submit"
              className="btn btn-gold btn-block"
              disabled={busy}
            >
              {busy ? copy.creating : copy.continue}
            </button>
          </form>
          <p className="auth-links">
            {copy.exists} <Link href="/login">{copy.login}</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
