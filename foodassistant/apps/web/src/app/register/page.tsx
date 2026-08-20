"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useLocale } from "@/components/locale-provider";
import { ApiError, register } from "@/lib/api";

const ownerSteps = [
  "Создайте защищённый аккаунт владельца",
  "Заполните профиль и поставьте точку на карте",
  "Отправьте заведение на проверку платформы",
  "После публикации принимайте брони в кабинете",
];

export default function RegisterPage() {
  const router = useRouter();
  const { locale } = useLocale();
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
            ? "Этот email уже зарегистрирован"
            : err.code
          : "Не удалось создать аккаунт. Попробуйте ещё раз.",
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
          <span className="owner-kicker">FoodAssistant для бизнеса</span>
          <h1>Ваш ресторан — на карте города и в телефоне гостя.</h1>
          <p>
            От первой заявки до бронирований — один понятный кабинет владельца.
            Регистрация для гостей доступна в мобильном приложении.
          </p>

          <ol className="owner-register-steps">
            {ownerSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>

          <div className="owner-register-trust">
            <strong>Проверка 1–3 рабочих дня</strong>
            <span>История действий сохраняется автоматически</span>
          </div>
        </section>

        <section className="auth-card owner-register-card">
          <span className="owner-kicker">Аккаунт владельца</span>
          <h2>Подключить ресторан</h2>
          <p>
            Сначала создаём личный доступ. Данные ресторана вы заполните следующим
            шагом в кабинете.
          </p>

          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="owner-form-row">
              <div className="field">
                <label htmlFor="first_name">Имя</label>
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
                <label htmlFor="last_name">Фамилия</label>
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
              <label htmlFor="email">Рабочий email</label>
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
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Не менее 6 символов"
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
              Создавая аккаунт, вы подтверждаете, что имеете право представлять
              заведение и предоставлять данные для публикации.
            </p>
            {error && <p className="auth-error">{error}</p>}
            <button
              type="submit"
              className="btn btn-gold btn-block"
              disabled={busy}
            >
              {busy ? "Создаём кабинет…" : "Продолжить в кабинет"}
            </button>
          </form>
          <p className="auth-links">
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
