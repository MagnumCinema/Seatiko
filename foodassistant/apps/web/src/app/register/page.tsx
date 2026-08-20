"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useLocale } from "@/components/locale-provider";
import {
  ApiError,
  register,
  type UserRole,
} from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const [role, setRole] = useState<UserRole>("guest");
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
        role,
      });
      if (role === "restaurant") router.replace("/cabinet");
      else router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "email_taken"
            ? "Этот email уже зарегистрирован"
            : err.code
          : "Ошибка регистрации",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="auth-card">
        <h1>Регистрация</h1>
        <p>Гость или владелец ресторана для подачи заявки.</p>

        <div className="role-toggle" role="group" aria-label="Тип аккаунта">
          <button
            type="button"
            className={role === "guest" ? "on" : ""}
            onClick={() => setRole("guest")}
          >
            Гость
          </button>
          <button
            type="button"
            className={role === "restaurant" ? "on" : ""}
            onClick={() => setRole("restaurant")}
          >
            Ресторан
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label htmlFor="first_name">Имя</label>
            <input
              id="first_name"
              value={form.first_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, first_name: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="last_name">Фамилия</label>
            <input
              id="last_name"
              value={form.last_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, last_name: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль (мин. 6)</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Создание…" : "Создать аккаунт"}
          </button>
        </form>
        <p className="auth-links">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
