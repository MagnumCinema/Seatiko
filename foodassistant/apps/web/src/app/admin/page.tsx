"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  adminListApplications,
  adminPublishApplication,
  adminReviewApplication,
  fetchMe,
  getToken,
  mediaUrl,
  pickLocale,
  type ApplicationStatus,
  type User,
  type VenueApplication,
} from "@/lib/api";

const FILTERS: Array<{ id: ApplicationStatus | ""; label: string }> = [
  { id: "", label: "Все" },
  { id: "SUBMITTED", label: "Отправлено" },
  { id: "UNDER_REVIEW", label: "На проверке" },
  { id: "APPROVED", label: "Одобрено" },
  { id: "REJECTED", label: "Отклонено" },
  { id: "PUBLISHED", label: "Опубликовано" },
  { id: "DRAFT", label: "Черновик" },
];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<VenueApplication[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    try {
      const me = await fetchMe();
      if (me.role !== "admin") {
        router.replace("/");
        return;
      }
      setUser(me);
      const list = await adminListApplications(filter);
      setApps(list);
    } catch {
      router.replace("/login");
    }
  }, [router, filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function review(
    id: string,
    status: "UNDER_REVIEW" | "APPROVED" | "REJECTED",
    reason?: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      await adminReviewApplication(id, {
        status,
        reject_reason: reason,
      });
      setRejectFor(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function publish(id: string) {
    setBusy(true);
    setError(null);
    try {
      await adminPublishApplication(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка публикации");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="panel-page">
        <p className="panel-empty" style={{ padding: 48 }}>
          Загрузка…
        </p>
      </div>
    );
  }

  return (
    <PanelShell
      title="Админ · модерация"
      subtitle="Заявки ресторанов"
      email={user.email}
    >
      <div className="auth-hint" style={{ marginTop: 0, marginBottom: 20 }}>
        Вход: <code>admin@foodassistant.local</code> / <code>admin123</code>
      </div>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            className={`filter-chip ${filter === f.id ? "on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}

      {apps.length === 0 ? (
        <p className="panel-empty">Нет заявок по фильтру.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Заведение</th>
                <th>Статус</th>
                <th>Контакты</th>
                <th>Фото</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{pickLocale(a.name, "ru") || "—"}</strong>
                    <div style={{ color: "var(--fa-muted)", fontSize: 13 }}>
                      {pickLocale(a.address, "ru")}
                    </div>
                    {a.reject_reason && (
                      <div style={{ color: "#fca5a5", fontSize: 12 }}>
                        {a.reject_reason}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {a.phone}
                    <br />
                    {a.email}
                  </td>
                  <td>
                    <div className="photo-grid">
                      {(a.photo_urls || []).slice(0, 3).map((url) => (
                        <div
                          key={url}
                          className="photo-thumb"
                          style={{ width: 48, height: 48 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mediaUrl(url)} alt="" />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="admin-actions">
                      {(a.status === "SUBMITTED" ||
                        a.status === "UNDER_REVIEW") && (
                        <>
                          <button
                            type="button"
                            className="panel-btn sm ghost"
                            disabled={busy}
                            onClick={() => void review(a.id, "UNDER_REVIEW")}
                          >
                            На проверку
                          </button>
                          <button
                            type="button"
                            className="panel-btn sm"
                            disabled={busy}
                            onClick={() => void review(a.id, "APPROVED")}
                          >
                            Одобрить
                          </button>
                          <button
                            type="button"
                            className="panel-btn sm danger"
                            disabled={busy}
                            onClick={() => {
                              setRejectFor(a.id);
                              setRejectReason("");
                            }}
                          >
                            Отклонить
                          </button>
                        </>
                      )}
                      {a.status === "APPROVED" && (
                        <button
                          type="button"
                          className="panel-btn sm"
                          disabled={busy}
                          onClick={() => void publish(a.id)}
                        >
                          Опубликовать
                        </button>
                      )}
                    </div>
                    {rejectFor === a.id && (
                      <div style={{ marginTop: 10 }}>
                        <input
                          placeholder="Причина отклонения"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          style={{
                            width: "100%",
                            marginBottom: 8,
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid var(--fa-border)",
                            background: "var(--fa-surface-2)",
                            color: "var(--fa-text)",
                          }}
                        />
                        <button
                          type="button"
                          className="panel-btn sm danger"
                          disabled={busy || !rejectReason.trim()}
                          onClick={() =>
                            void review(a.id, "REJECTED", rejectReason.trim())
                          }
                        >
                          Подтвердить отклонение
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
