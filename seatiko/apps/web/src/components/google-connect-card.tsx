"use client";

import { useEffect, useState } from "react";
import { connectGoogle, disconnectGoogle, listIdentities, type ConnectedIdentity, type User } from "@/lib/api";
import { apiErrorKey, googleErrorKey } from "@/lib/api-error-message";
import { GoogleLogo, GoogleSignInButton } from "@/components/google-sign-in-button";
import { useLocale, type MessageKey } from "@/components/locale-provider";

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

  /** Before Google opens: a password account confirms its password first. */
  function ready(): boolean {
    if (hasPassword && !password) {
      setErrorKey("error.password_required");
      return false;
    }
    setErrorKey(null);
    return true;
  }

  async function connect(credential: string, nonce: string) {
    setBusy(true);
    setErrorKey(null);
    try {
      setIdentities(await connectGoogle({ credential, nonce, password: hasPassword ? password : undefined }));
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
        <GoogleLogo size={18} />
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
        <button type="button" className="btn btn--secondary btn--md guest-security-action-btn" disabled={busy} onClick={() => void disconnect()}>
          <span>{t("google.disconnect")}</span>
        </button>
      ) : (
        <div className="google-connect-action" aria-busy={busy}>
          <GoogleSignInButton
            canStart={ready}
            onCredential={(credential, nonce) => void connect(credential, nonce)}
            onUnavailable={() => setGoogleOff(true)}
            onError={(code) => setErrorKey(googleErrorKey(code))}
          >
            <button type="button" className="btn btn--secondary btn--md guest-security-action-btn">
              <GoogleLogo size={16} />
              <span>{t("google.connect")}</span>
            </button>
          </GoogleSignInButton>
        </div>
      )}
    </div>
  );
}
