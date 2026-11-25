"use client";

import { DEMO_LOGIN } from "@/lib/demo";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  ApiError,
  fetchMe,
  getToken,
  googleSignIn,
  login,
  logout,
  redirectPathForRole,
  register,
  type User,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { apiErrorKey } from "@/lib/api-error-message";
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

function BellIcon() {
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

const PRESET_ACCOUNTS = {
  guest: {
    email: "guest@seatiko.local",
    password: "guest123",
    role: "guest",
    target: "/account",
  },
  restaurant: {
    email: "owner@seatiko.local",
    password: "owner123",
    role: "restaurant",
    target: "/cabinet",
  },
  staff: {
    email: "staff@seatiko.local",
    password: "staff123",
    role: "staff",
    target: "/staff",
  },
  admin: {
    email: "admin@seatiko.local",
    password: "admin123",
    role: "admin",
    target: "/admin",
  },
} as const;

type PresetKey = keyof typeof PRESET_ACCOUNTS;

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

function InfoIcon() {
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
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
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
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.8 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"
      />
      <path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.2 0-5.8-2.4-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.71-.93 2.73 1 .08 2.01-.48 2.63-1.23z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.18 3.35-1.39 3.73-1.39.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
}

function DemoPresetsRow({
  copy,
  busy,
  busyPreset,
  onSelect,
}: {
  copy: ReturnType<typeof getSiteCopy>["login"];
  busy: boolean;
  busyPreset: PresetKey | null;
  onSelect: (key: PresetKey) => void;
}) {
  return (
    <div className="login-demo-row">
      <button
        type="button"
        className={`btn-demo-chip ${busyPreset === "guest" ? "loading" : ""}`}
        disabled={busy || busyPreset !== null}
        onClick={() => onSelect("guest")}
        title="Войти как гость: guest@seatiko.local"
      >
        {busyPreset === "guest" ? <SpinnerIcon /> : <UserIcon />}
        <span>{copy.demoGuestChip}</span>
      </button>
      <button
        type="button"
        className={`btn-demo-chip ${busyPreset === "restaurant" ? "loading" : ""}`}
        disabled={busy || busyPreset !== null}
        onClick={() => onSelect("restaurant")}
        title="Войти как владелец: owner@seatiko.local"
      >
        {busyPreset === "restaurant" ? <SpinnerIcon /> : <BuildingIcon />}
        <span>{copy.demoVenueChip}</span>
      </button>
      <button
        type="button"
        className={`btn-demo-chip ${busyPreset === "staff" ? "loading" : ""}`}
        disabled={busy || busyPreset !== null}
        onClick={() => onSelect("staff")}
        title="Войти как персонал: staff@seatiko.local"
      >
        {busyPreset === "staff" ? <SpinnerIcon /> : <BellIcon />}
        <span>{copy.demoStaffChip}</span>
      </button>
      <button
        type="button"
        className={`btn-demo-chip ${busyPreset === "admin" ? "loading" : ""}`}
        disabled={busy || busyPreset !== null}
        onClick={() => onSelect("admin")}
        title="Войти как админ: admin@seatiko.local"
      >
        {busyPreset === "admin" ? <SpinnerIcon /> : <ShieldIcon />}
        <span>{copy.demoAdminChip}</span>
      </button>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useLocale();
  const [googleOff, setGoogleOff] = useState(false);
  const copy = getSiteCopy(locale).login;

  const [isRegisteringGuest, setIsRegisteringGuest] = useState(false);
  const roleParam = searchParams.get("role");
  const initialPreset =
    roleParam === "restaurant"
      ? PRESET_ACCOUNTS.restaurant
      : roleParam === "admin"
      ? PRESET_ACCOUNTS.admin
      : roleParam === "staff"
      ? PRESET_ACCOUNTS.staff
      : roleParam === "guest"
      ? PRESET_ACCOUNTS.guest
      : null;

  const [email, setEmail] = useState(() => initialPreset?.email ?? "");
  const [password, setPassword] = useState(() => initialPreset?.password ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyPreset, setBusyPreset] = useState<PresetKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  // Active Session Detection
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    fetchMe()
      .then((u) => {
        if (alive) setCurrentUser(u);
      })
      .catch(() => {
        if (alive) setCurrentUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleQuickDemo = async (type: PresetKey) => {
    setError(null);
    setShowForgot(false);
    setSocialNotice(null);
    setIsRegisteringGuest(false);

    const preset = PRESET_ACCOUNTS[type];
    setEmail(preset.email);
    setPassword(preset.password);
    setBusyPreset(type);

    try {
      logout();
      const res = await login({ email: preset.email, password: preset.password });
      const next = searchParams.get("next");
      const fallback = redirectPathForRole(res.user.role);
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : fallback;
      router.replace(target);
    } catch (err) {
      setBusyPreset(null);
      setError(
        err instanceof ApiError
          ? err.code === "invalid_credentials"
            ? copy.invalid
            : err.code === "email_taken"
            ? copy.failed
            : err.code
          : copy.failed,
      );
    }
  };

  const handleSocialClick = (provider: string) => {
    const notice = copy.socialSoonToast.replace("{provider}", provider);
    setSocialNotice(notice);
  };

  const isPasswordValid = password.length >= 6;

  /** Google's ID token → Seatiko session (a first sign-in creates a guest account). */
  async function onGoogle(credential: string) {
    setBusy(true);
    setError(null);
    setSocialNotice(null);
    try {
      const res = await googleSignIn({ credential, locale, role: "guest" });
      const next = searchParams.get("next");
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : redirectPathForRole(res.user.role);
      router.replace(target);
    } catch (err) {
      setError(t(apiErrorKey(err)));
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSocialNotice(null);

    const cleanEmail = email.trim();

    try {
      if (isRegisteringGuest) {
        await register({
          email: cleanEmail,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          locale,
          role: "guest",
        });
        const next = searchParams.get("next");
        const target =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/account";
        router.replace(target);
      } else {
        const res = await login({ email: cleanEmail, password });
        const next = searchParams.get("next");
        const fallback = redirectPathForRole(res.user.role);
        const target =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : fallback;
        router.replace(target);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "invalid_credentials"
            ? copy.invalid
            : err.code === "email_taken"
            ? copy.failed
            : err.code
          : copy.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  // Active Session View
  if (currentUser) {
    const roleBadge =
      currentUser.role === "admin"
        ? copy.roleAdminBadge
        : currentUser.role === "restaurant"
        ? copy.roleRestaurantBadge
        : currentUser.role === "staff"
        ? copy.roleStaffBadge
        : copy.roleGuestBadge;

    const continueTarget =
      searchParams.get("next") || redirectPathForRole(currentUser.role);

    const continueLabel =
      currentUser.role === "admin"
        ? copy.continueToAdmin
        : currentUser.role === "restaurant"
        ? copy.continueToCabinet
        : copy.continueToAccount;

    return (
      <div className="auth-card login-card">
        <div className="login-session-card">
          <div className="login-session-avatar">
            <UserIcon />
          </div>
          <div className="login-session-info">
            <span className="login-session-badge">{roleBadge}</span>
            <h2>{copy.alreadySignedIn}</h2>
            <p>
              {copy.signedInAs}{" "}
              <strong>
                {currentUser.display_name ||
                  currentUser.first_name ||
                  currentUser.email}
              </strong>
            </p>
          </div>
          <div className="login-session-actions">
            <button
              type="button"
              className="btn btn-gold btn-block"
              onClick={() => router.replace(continueTarget)}
            >
              <span>{continueLabel}</span>
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="btn-switch-account"
              onClick={() => {
                logout();
                setCurrentUser(null);
              }}
            >
              {copy.signOutOrSwitch}
            </button>
          </div>

          {DEMO_LOGIN && (
            <div className="login-quick-switch-section">
              <span className="login-quick-switch-title">{copy.quickSwitchTitle}</span>
              <DemoPresetsRow
                copy={copy}
                busy={busy}
                busyPreset={busyPreset}
                onSelect={(k) => void handleQuickDemo(k)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card login-card">
      {/* Header */}
      <div className="login-header">
        <h1>
          {isRegisteringGuest
            ? copy.unifiedRegisterGuestTitle
            : copy.unifiedTitle}
        </h1>
        <p>
          {isRegisteringGuest
            ? copy.unifiedRegisterGuestBody
            : copy.unifiedBody}
        </p>
      </div>

      {/* Sign in with Google (Google's own button), then the providers still to come */}
      {(!isRegisteringGuest || !googleOff) && (
        <>
          {!googleOff && (
            <GoogleSignInButton
              text={isRegisteringGuest ? "signup_with" : "continue_with"}
              onCredential={(credential) => void onGoogle(credential)}
              onUnavailable={() => setGoogleOff(true)}
            />
          )}
          {!isRegisteringGuest && (
          <div className={`auth-social-row${googleOff ? "" : " auth-social-row-two"}`}>
            {googleOff && (
            <button
              type="button"
              className="auth-social-btn google"
              onClick={() => handleSocialClick("Google")}
              aria-label={copy.authGoogle}
              title={copy.authGoogle}
            >
              <GoogleIcon />
              <span>Google</span>
            </button>
            )}
            <button
              type="button"
              className="auth-social-btn apple"
              onClick={() => handleSocialClick("Apple")}
              aria-label={copy.authApple}
              title={copy.authApple}
            >
              <AppleIcon />
              <span>Apple</span>
            </button>
            <button
              type="button"
              className="auth-social-btn telegram"
              onClick={() => handleSocialClick("Telegram")}
              aria-label={copy.authTelegram}
              title={copy.authTelegram}
            >
              <TelegramIcon />
              <span>Telegram</span>
            </button>
          </div>
          )}

          {/* Social Notice Toast */}
          {socialNotice && (
            <div className="auth-social-notice" role="status">
              <InfoIcon />
              <span>{socialNotice}</span>
              <button
                type="button"
                onClick={() => setSocialNotice(null)}
                aria-label={copy.loading}
              >
                ×
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="auth-divider">
            <span>{copy.socialDivider}</span>
          </div>
        </>
      )}

      <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
        {/* Guest Registration Name Fields */}
        {isRegisteringGuest && (
          <div className="guest-names-row">
            <div className="field">
              <label htmlFor="firstName">{copy.firstName}</label>
              <input
                id="firstName"
                required
                autoComplete="given-name"
                placeholder={copy.firstName}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="lastName">{copy.lastName}</label>
              <input
                id="lastName"
                required
                autoComplete="family-name"
                placeholder={copy.lastName}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Email Field */}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Password Field */}
        <div className="field password-field-wrap">
          <div className="field-label-row">
            <label htmlFor="password">{copy.password}</label>
            {!isRegisteringGuest && (
              <button
                type="button"
                className="btn-forgot-link"
                onClick={() => setShowForgot(!showForgot)}
              >
                {copy.forgotPassword}
              </button>
            )}
          </div>

          <div className="password-input-row">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                isRegisteringGuest ? "new-password" : "current-password"
              }
              required
              minLength={6}
              placeholder={copy.passwordHint}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              title={showPassword ? copy.hidePassword : copy.showPassword}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {/* Password Validation Hint on Register */}
          {isRegisteringGuest && password.length > 0 && (
            <div
              className={`password-strength-hint ${
                isPasswordValid ? "valid" : "invalid"
              }`}
            >
              <span className="password-strength-dot" aria-hidden="true" />
              <span>
                {isPasswordValid
                  ? `✓ ${copy.passwordHint}`
                  : `${copy.passwordHint} (${password.length}/6)`}
              </span>
            </div>
          )}
        </div>

        {/* Forgot Password Helper Box */}
        {showForgot && (
          <div className="login-forgot-hint" role="status">
            <InfoIcon />
            <span>{copy.forgotPasswordModal}</span>
            <button
              type="button"
              className="login-forgot-hint-x"
              onClick={() => setShowForgot(false)}
            >
              ×
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="auth-error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Action Button */}
        <button
          type="submit"
          className="btn btn-gold btn-block"
          disabled={busy}
        >
          <span>
            {busy
              ? isRegisteringGuest
                ? copy.guestRegisterBusy
                : copy.busy
              : isRegisteringGuest
              ? copy.guestRegisterAction
              : copy.action}
          </span>
          {!busy && <ArrowRightIcon />}
        </button>

        {/* 1-Click Fast Demo Credentials (4 Roles), development only */}
        {DEMO_LOGIN && !isRegisteringGuest && (
          <DemoPresetsRow
            copy={copy}
            busy={busy}
            busyPreset={busyPreset}
            onSelect={(k) => void handleQuickDemo(k)}
          />
        )}
      </form>

      {/* Demo Credentials Info Strip (only in Login mode, development only) */}
      {DEMO_LOGIN && !isRegisteringGuest && (
        <div className="login-demo-details">
          <span>
            {copy.demoGuestChip}: <code>guest@seatiko.local</code> (guest123)
          </span>
          <span>
            {copy.demoVenueChip}: <code>owner@seatiko.local</code> (owner123)
          </span>
          <span>
            {copy.demoStaffChip}: <code>staff@seatiko.local</code> (staff123)
          </span>
          <span>
            {copy.demoAdminChip}: <code>admin@seatiko.local</code> (admin123)
          </span>
        </div>
      )}

      {/* Sub Actions with Prompts Above Buttons */}
      <div className={`login-sub-actions ${isRegisteringGuest ? "single" : ""}`}>
        {isRegisteringGuest ? (
          <div className="login-sub-column single">
            <span className="login-sub-prompt">{copy.haveAccountPrompt}</span>
            <button
              type="button"
              className="btn-sub-action"
              onClick={() => {
                setIsRegisteringGuest(false);
                setError(null);
              }}
            >
              <span>← {copy.haveAccountLink}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="login-sub-column">
              <span className="login-sub-prompt">{copy.newGuestPrompt}</span>
              <button
                type="button"
                className="btn-sub-action"
                onClick={() => {
                  setIsRegisteringGuest(true);
                  setError(null);
                  setShowForgot(false);
                }}
              >
                <UserIcon />
                <span>{copy.newGuestLink}</span>
              </button>
            </div>
            <div className="login-sub-column">
              <span className="login-sub-prompt">{copy.venuePrompt}</span>
              <Link
                href="/register"
                className="btn-sub-action"
              >
                <BuildingIcon />
                <span>{copy.venueRegisterLink}</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).login;

  return (
    <div className="auth-page login-page">
      <SiteHeader />
      <main className="login-shell">
        <Suspense
          fallback={
            <div className="auth-card login-card">
              <p style={{ textAlign: "center", color: "var(--site-muted)" }}>
                {copy.loading}
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
