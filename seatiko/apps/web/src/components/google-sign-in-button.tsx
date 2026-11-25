"use client";

import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { fetchAuthProviders, type AuthProviders } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { GoogleAuthError, signInWithGooglePopup } from "@/lib/google-oauth";

// Sign in with Google from the site's own button: a click opens Google's account chooser
// (lib/google-oauth) and hands back an ID token and its nonce, which the caller sends to
// the API. Shows nothing while the server has no GOOGLE_CLIENT_IDS.

let providersPromise: Promise<AuthProviders> | null = null;

function providers(): Promise<AuthProviders> {
  providersPromise ??= fetchAuthProviders().catch((error) => {
    providersPromise = null;
    throw error;
  });
  return providersPromise;
}

type Props = {
  /** Receives Google's ID token and the nonce it must carry; the caller signs in or connects. */
  onCredential: (credential: string, nonce: string) => void;
  /** Called when Google sign-in is off on the server (or the server is unreachable). */
  onUnavailable?: () => void;
  /** access_denied (the user said no), popup_blocked, google_failed. */
  onError?: (code: string) => void;
  /**
   * Sign-in only: a blocked popup becomes a full-page redirect, and the callback page
   * signs in with this role and returns here. Not for connecting (it needs the password).
   */
  redirect?: { role: "guest" | "restaurant" };
  /** Checked on click before Google opens (e.g. the password to connect is filled in). */
  canStart?: () => boolean;
  className?: string;
  /** The site's own button; a click anywhere on it starts Google sign-in. */
  children: ReactNode;
};

export function GoogleSignInButton({ onCredential, onUnavailable, onError, redirect, canStart, className, children }: Props) {
  const { locale } = useLocale();
  const [clientId, setClientId] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const unavailable = useEffectEvent(() => onUnavailable?.());

  useEffect(() => {
    let alive = true;
    providers()
      .then(({ google }) => {
        if (!alive) return;
        if (google.enabled && google.client_id) setClientId(google.client_id);
        else {
          setOff(true);
          unavailable();
        }
      })
      .catch(() => {
        if (!alive) return;
        setOff(true);
        unavailable();
      });
    return () => {
      alive = false;
    };
  }, []);

  function start() {
    // Synchronous from the click, so the browser lets the popup open.
    if (!clientId || (canStart && !canStart())) return;
    signInWithGooglePopup(clientId, { locale, role: redirect?.role, redirectIfBlocked: Boolean(redirect) })
      .then(({ credential, nonce }) => onCredential(credential, nonce))
      .catch((error: unknown) => {
        const code = error instanceof GoogleAuthError ? error.code : "google_failed";
        if (code !== "popup_closed") onError?.(code);
      });
  }

  if (off) return null;
  return (
    <div
      className={`google-auth-wrap${className ? ` ${className}` : ""}`}
      data-state={clientId ? "ready" : "loading"}
      onClick={start}
    >
      {children}
    </div>
  );
}

/** Google "G", for site-styled Google buttons. */
export function GoogleLogo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
