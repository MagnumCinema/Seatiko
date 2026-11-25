"use client";

import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { fetchAuthProviders, type AuthProviders } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";

// Sign in with Google through Google Identity Services: Google's own button hands the
// page an ID token (`credential`), which the API exchanges for a Seatiko session.
// Renders nothing while the server has no GOOGLE_CLIENT_IDS.

type GsiButtonOptions = {
  theme: "outline" | "filled_black" | "filled_blue";
  size: "large" | "medium" | "small";
  shape: "pill" | "rectangular";
  text: "signin_with" | "signup_with" | "continue_with";
  logo_alignment: "left" | "center";
  locale: string;
  width?: number;
};

type Gsi = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        itp_support?: boolean;
        ux_mode?: "popup" | "redirect";
      }): void;
      renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
      disableAutoSelect(): void;
    };
  };
};

declare global {
  interface Window {
    google?: Gsi;
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

let providersPromise: Promise<AuthProviders> | null = null;
let scriptPromise: Promise<Gsi> | null = null;
let initializedFor = "";
/** GIS keeps one callback per page; it forwards to the button that is on screen now. */
let currentHandler: ((credential: string) => void) | null = null;

function providers(): Promise<AuthProviders> {
  providersPromise ??= fetchAuthProviders().catch((error) => {
    providersPromise = null;
    throw error;
  });
  return providersPromise;
}

function loadGsi(): Promise<Gsi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  scriptPromise ??= new Promise<Gsi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("gsi_missing")));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("gsi_unavailable"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Props = {
  /** Receives Google's ID token; the caller signs in or connects with it. */
  onCredential: (credential: string) => void;
  text?: GsiButtonOptions["text"];
  /** Called when the button cannot be shown (Google off or unreachable). */
  onUnavailable?: () => void;
  className?: string;
  /**
   * The site's own button. Google's button then lies invisibly on top of it and takes
   * the click (GIS only hands out ID tokens through its own button), so the page keeps
   * its design. Without Google (off or unreachable) only this button stays.
   */
  children?: ReactNode;
};

export function GoogleSignInButton({ onCredential, text = "continue_with", onUnavailable, className, children }: Props) {
  const overlay = children !== undefined;
  const { locale } = useLocale();
  const { theme } = useTheme();
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  // Latest callbacks without re-rendering Google's button when the parent re-renders.
  const credential = useEffectEvent((token: string) => onCredential(token));
  const unavailable = useEffectEvent(() => onUnavailable?.());

  useEffect(() => {
    let alive = true;
    const forward = (token: string) => credential(token);
    (async () => {
      try {
        const { google } = await providers();
        if (!google.enabled || !google.client_id) throw new Error("google_off");
        const gsi = await loadGsi();
        if (!alive || !slot.current) return;
        if (initializedFor !== google.client_id) {
          gsi.accounts.id.initialize({
            client_id: google.client_id,
            callback: ({ credential }) => currentHandler?.(credential),
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true,
            ux_mode: "popup",
          });
          initializedFor = google.client_id;
        }
        currentHandler = forward;
        slot.current.innerHTML = "";
        const width = Math.min(400, Math.max(200, Math.round(slot.current.getBoundingClientRect().width) || 320));
        gsi.accounts.id.renderButton(slot.current, {
          theme: overlay || theme !== "dark" ? "outline" : "filled_black",
          size: "large",
          shape: "pill",
          text,
          logo_alignment: "center",
          locale,
          width,
        });
        setState("ready");
      } catch {
        if (!alive) return;
        setState("off");
        unavailable();
      }
    })();
    return () => {
      alive = false;
      if (currentHandler === forward) currentHandler = null;
    };
  }, [locale, theme, text, overlay]);

  if (overlay) {
    return (
      <div className={`google-auth-wrap${className ? ` ${className}` : ""}`} data-state={state}>
        {/* While Google's button is on top, the face is only a picture of it. */}
        <div className="google-auth-face" inert={state === "ready"}>
          {children}
        </div>
        {state !== "off" && <div ref={slot} className="google-auth-overlay" />}
      </div>
    );
  }

  if (state === "off") return null;
  return (
    <div
      ref={slot}
      className={`google-signin-slot${className ? ` ${className}` : ""}`}
      data-state={state}
      style={{ width: "100%", minHeight: 44, display: "flex", justifyContent: "center" }}
    />
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
