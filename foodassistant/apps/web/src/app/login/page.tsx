"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import {
  ApiError,
  login,
  redirectPathForRole,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

export default function LoginPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).login;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login({ email, password });
      router.replace(redirectPathForRole(res.user.role));
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

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="auth-card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">{copy.password}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-gold btn-block" disabled={busy}>
            {busy ? copy.busy : copy.action}
          </button>
        </form>
        <div className="auth-hint">
          {copy.demo}{" "}
          <code>admin@foodassistant.local</code> / <code>admin123</code>
        </div>
        <p className="auth-links">
          {copy.noAccount} <Link href="/register">{copy.register}</Link>
        </p>
      </div>
    </div>
  );
}
