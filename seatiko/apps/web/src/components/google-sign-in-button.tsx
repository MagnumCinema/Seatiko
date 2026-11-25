"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
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
};

export function GoogleSignInButton({ onCredential, text = "continue_with", onUnavailable, className }: Props) {
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
          theme: theme === "dark" ? "filled_black" : "outline",
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
  }, [locale, theme, text]);

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
