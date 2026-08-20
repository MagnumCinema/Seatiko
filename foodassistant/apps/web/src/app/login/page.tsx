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

export default function LoginPage() {
  const router = useRouter();
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
            ? "Неверный email или пароль"
            : err.code
          : "Ошибка входа",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="auth-card">
        <h1>Войти</h1>
        <p>Кабинет ресторана или панель модерации.</p>
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
            <label htmlFor="password">Пароль</label>
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
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>
        <div className="auth-hint">
          Админ (демо):{" "}
          <code>admin@foodassistant.local</code> / <code>admin123</code>
        </div>
        <p className="auth-links">
          Нет аккаунта? <Link href="/register">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}
