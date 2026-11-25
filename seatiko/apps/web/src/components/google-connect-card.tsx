"use client";

import { useEffect, useState } from "react";
import { connectGoogle, disconnectGoogle, listIdentities, type ConnectedIdentity, type User } from "@/lib/api";
import { apiErrorKey } from "@/lib/api-error-message";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { useLocale, type MessageKey } from "@/components/locale-provider";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

type Props = {
  user: User;
  onUserUpdated?: (user: User) => void;
  onToast?: (message: string) => void;
};

/** Profile card: which Google account signs this user in; connect or disconnect it. */
export function GoogleConnectCard({ user, onToast }: Props) {
  const { t } = useLocale();
  const [identities, setIdentities] = useState<ConnectedIdentity[] | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [googleOff, setGoogleOff] = useState(false);
  const hasPassword = user.has_password !== false;

  useEffect(() => {
    let alive = true;
    listIdentities()
      .then((list) => alive && setIdentities(list))
      .catch(() => alive && setIdentities([]));
    return () => {
      alive = false;
    };
  }, [user.id]);

  const google = identities?.find((i) => i.provider === "google");

  async function connect(credential: string) {
    if (hasPassword && !password) {
      setErrorKey("error.password_required");
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      setIdentities(await connectGoogle({ credential, password: hasPassword ? password : undefined }));
      setPassword("");
      onToast?.(t("google.connected_ok"));
    } catch (error) {
      setErrorKey(apiErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setErrorKey(null);
    try {
      setIdentities(await disconnectGoogle());
      onToast?.(t("google.disconnected"));
    } catch (error) {
      setErrorKey(apiErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  // Nothing to show while Google sign-in is off on the server and nothing is connected.
  if (identities === null || (googleOff && !google)) return null;

  return (
    <div className="guest-security-card google-connect-card">
      <div className="guest-security-icon-wrap">
        <GoogleMark />
      </div>
      <div className="guest-security-info">
        <div className="guest-security-title-wrap">
          <span className="guest-security-label">{t("google.section")}</span>
        </div>
        <p className="guest-security-desc">
          {google ? t("google.connected", { email: google.email }) : t("google.not_connected")}
        </p>
        {!hasPassword && <p className="guest-security-desc">{t("google.no_password")}</p>}
        {!google && hasPassword && (
          <input
            type="password"
            className="google-connect-password"
            autoComplete="current-password"
            placeholder={t("google.connect_password")}
            aria-label={t("google.connect_password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorKey) setErrorKey(null);
            }}
          />
        )}
        {errorKey && (
          <p className="guest-delete-error" role="alert">
            {t(errorKey)}
          </p>
        )}
      </div>
      {google ? (
        <button type="button" className="btn btn-outline guest-security-action-btn" disabled={busy} onClick={() => void disconnect()}>
          <span>{t("google.disconnect")}</span>
        </button>
      ) : (
        <div className="google-connect-action" aria-busy={busy}>
          <GoogleSignInButton text="continue_with" onCredential={(credential) => void connect(credential)} onUnavailable={() => setGoogleOff(true)} />
        </div>
      )}
    </div>
  );
}
