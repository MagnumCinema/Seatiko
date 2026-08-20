"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  email?: string;
};

export function PanelShell({ title, subtitle, children, email }: Props) {
  const router = useRouter();

  return (
    <div className="panel-page">
      <SiteHeader />
      <div className="panel-wrap">
        <div className="panel-top">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="panel-sub">{subtitle}</p>}
          </div>
          <div className="panel-top-actions">
            {email && <span className="panel-email">{email}</span>}
            <Link href="/" className="panel-link">
              На сайт
            </Link>
            <button
              type="button"
              className="panel-btn ghost"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Выйти
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
