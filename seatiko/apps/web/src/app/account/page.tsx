"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GuestProfile } from "@/components/guest-profile";
import { useLocale } from "@/components/locale-provider";
import {
  fetchMe,
  getToken,
  login,
  logout,
  type User,
} from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!getToken()) {
        if (alive) {
          setUser(null);
          setReady(true);
        }
        return;
      }
      fetchMe()
        .then((u) => {
          if (alive) setUser(u);
        })
        .catch(() => {
          if (alive) setUser(null);
        })
        .finally(() => {
          if (alive) setReady(true);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleQuickDemo = async () => {
    try {
      const res = await login({
        email: "guest@seatiko.local",
        password: "guest123",
      });
      setUser(res.user);
      setToast("Вы успешно авторизованы как Demo Guest");
    } catch {
      router.push("/login?role=guest&next=/account");
    }
  };

  if (!ready) {
    return (
      <div className="account-page">
        <SiteHeader />
        <main className="account-main">
          <div className="account-loading-box">
            <div className="account-spinner" />
            <p className="account-loading">{t("common.loading")}</p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="account-page">
      <SiteHeader />
      <main className="account-main">
        {toast && (
          <div className="account-toast" role="status">
            <span>{toast}</span>
            <button
              type="button"
              className="account-toast-close"
              onClick={() => setToast(null)}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        )}
        <GuestProfile
          user={user}
          onRequestSignIn={() => router.push("/login?role=guest&next=/account")}
          onQuickDemoSignIn={handleQuickDemo}
          onUserUpdated={setUser}
          onLogout={() => {
            logout();
            setUser(null);
            setToast(t("auth.logout"));
          }}
          onToast={setToast}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
