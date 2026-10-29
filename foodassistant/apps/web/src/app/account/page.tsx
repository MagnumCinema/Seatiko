"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { GuestProfile } from "@/components/guest-profile";
import { useLocale } from "@/components/locale-provider";
import {
  fetchMe,
  getToken,
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

  if (!ready) {
    return (
      <div className="account-page">
        <SiteHeader />
        <p className="account-loading">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="account-page">
      <SiteHeader />
      <main className="account-main">
        {toast && (
          <p className="account-toast" role="status">
            {toast}
          </p>
        )}
        <GuestProfile
          user={user}
          onRequestSignIn={() => router.push("/login?next=/account")}
          onUserUpdated={setUser}
          onLogout={() => {
            logout();
            setUser(null);
            setToast(t("auth.logout"));
          }}
          onToast={setToast}
        />
      </main>
    </div>
  );
}
