"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { googleSignIn, redirectPathForRole } from "@/lib/api";
import { apiErrorKey, googleErrorKey } from "@/lib/api-error-message";
import { postToOpener, takePending } from "@/lib/google-oauth";
import { useLocale, type MessageKey } from "@/components/locale-provider";

// Google sends the browser here after its account chooser, with the ID token in the URL
// fragment (it never reaches a server log). In the popup, the token goes to the page that
// opened it; after a full-page redirect (popup blocked), this page signs in itself.

export default function GoogleCallbackPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [popupDone, setPopupDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Keep the token out of the history and of anything that reads the URL later.
    window.history.replaceState(null, "", window.location.pathname);
    const state = params.get("state") ?? "";
    const credential = params.get("id_token") ?? "";
    const error = params.get("error") ?? (credential ? "" : "google_failed");
    const pending = state ? takePending(state) : undefined;

    if (pending?.mode !== "redirect") {
      // Popup (or storage unavailable): hand the answer over and close.
      postToOpener({ state, credential: credential || undefined, error: error || undefined });
      queueMicrotask(() => setPopupDone(true));
      window.setTimeout(() => window.close(), 50);
      return;
    }

    if (error) {
      queueMicrotask(() => setErrorKey(googleErrorKey(error === "access_denied" ? "access_denied" : "google_failed")));
      return;
    }
    googleSignIn({ credential, nonce: pending.nonce, role: pending.role, locale: pending.locale })
      .then((res) => {
        const next = pending.next;
        router.replace(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/auth/") ? next : redirectPathForRole(res.user.role));
      })
      .catch((err: unknown) => setErrorKey(apiErrorKey(err)));
  }, [router]);

  return (
    <main className="auth-page" style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="auth-card login-card" style={{ maxWidth: 440, textAlign: "center" }}>
        {errorKey ? (
          <>
            <p role="alert">{t(errorKey)}</p>
            <Link className="btn btn-gold" href="/login">
              {t("auth.login")}
            </Link>
          </>
        ) : (
          <p role="status">{popupDone ? t("google.window_done") : t("common.loading")}</p>
        )}
      </div>
    </main>
  );
}
