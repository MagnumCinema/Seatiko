"use client";

import { useState, type FormEvent } from "react";
import { googleSignIn, login, register } from "@/lib/api";
import { GoogleLogo, GoogleSignInButton } from "@/components/google-sign-in-button";
import { apiErrorKey, googleErrorKey } from "@/lib/api-error-message";
import { useLocale, type MessageKey } from "@/components/locale-provider";

type AuthFormProps = {
  /** Called after the token is stored (header updates via the auth-change event). */
  onSuccess: () => void;
  onCancel?: () => void;
  hint?: string;
  titleId?: string;
  initialMode?: "login" | "register";
};

export function AuthForm({
  onSuccess,
  onCancel,
  hint,
  titleId,
  initialMode = "login",
}: AuthFormProps) {
  const { locale, t } = useLocale();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "" });
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  // No Google button when the server has Google sign-in off.
  const [googleOff, setGoogleOff] = useState(false);

  const update = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      if (mode === "register") {
        await register({
          email: form.email.trim(),
          password: form.password,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          locale,
        });
      } else {
        await login({ email: form.email.trim(), password: form.password });
      }
      onSuccess();
    } catch (error) {
      setErrorKey(apiErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  /** Google's ID token → session; a first sign-in creates a guest account. */
  async function google(credential: string, nonce: string) {
    setBusy(true);
    setErrorKey(null);
    try {
      await googleSignIn({ credential, nonce, locale, role: "guest" });
      onSuccess();
    } catch (error) {
      setErrorKey(apiErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? t("auth.login") : t("auth.register");

  return (
    <form className="booking-popup-auth" onSubmit={(e) => void submit(e)} noValidate>
      <h3 id={titleId}>{title}</h3>
      <p className="web-book-muted">{hint ?? t("res.auth_save")}</p>
      {!googleOff && (
      <GoogleSignInButton
        redirect={{ role: "guest" }}
        onCredential={(credential, nonce) => void google(credential, nonce)}
        onUnavailable={() => setGoogleOff(true)}
        onError={(code) => setErrorKey(googleErrorKey(code))}
      >
        <button type="button" className="btn btn--secondary btn--md btn--block auth-social-btn google auth-social-btn-wide">
          <GoogleLogo />
          <span>{t("google.continue")}</span>
        </button>
      </GoogleSignInButton>
      )}
      {mode === "register" && (
        <>
          <input
            aria-label={t("auth.first_name")}
            placeholder={t("auth.first_name")}
            autoComplete="given-name"
            value={form.first_name}
            onChange={(e) => update("first_name")(e.target.value)}
          />
          <input
            aria-label={t("auth.last_name")}
            placeholder={t("auth.last_name")}
            autoComplete="family-name"
            value={form.last_name}
            onChange={(e) => update("last_name")(e.target.value)}
          />
        </>
      )}
      <input
        data-autofocus
        type="email"
        aria-label={t("auth.email")}
        placeholder={t("auth.email")}
        autoComplete="email"
        required
        value={form.email}
        onChange={(e) => update("email")(e.target.value)}
      />
      <input
        type="password"
        aria-label={t("auth.password")}
        placeholder={t("auth.password")}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        value={form.password}
        onChange={(e) => update("password")(e.target.value)}
      />
      {errorKey && (
        <p className="web-book-error" role="alert">
          {t(errorKey)}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--md btn--block" disabled={busy}>
        {busy ? t("common.loading") : title}
      </button>
      <button
        type="button"
        className="btn btn--link"
        onClick={() => {
          setErrorKey(null);
          setMode((m) => (m === "login" ? "register" : "login"));
        }}
      >
        {mode === "login" ? t("auth.switch_register") : t("auth.switch_login")}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost btn--md btn--block" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      )}
    </form>
  );
}
