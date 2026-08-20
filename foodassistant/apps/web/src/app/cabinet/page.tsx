"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  createApplication,
  emptyLocalized,
  fetchMe,
  getToken,
  listMyApplications,
  mediaUrl,
  pickLocale,
  removeApplicationPhoto,
  submitApplication,
  updateApplication,
  uploadApplicationPhoto,
  type User,
  type VenueApplication,
} from "@/lib/api";

type Draft = {
  name: string;
  description: string;
  address: string;
  cuisine: string;
  phone: string;
  hours_text: string;
  email: string;
};

function toDraft(app: VenueApplication): Draft {
  return {
    name: pickLocale(app.name, "ru") || "",
    description: pickLocale(app.description, "ru") || "",
    address: pickLocale(app.address, "ru") || "",
    cuisine: (app.cuisine || []).join(", "),
    phone: app.phone || "",
    hours_text: app.hours_text || "",
    email: app.email || "",
  };
}

function editable(status: string) {
  return status === "DRAFT" || status === "REJECTED";
}

export default function CabinetPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<VenueApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    try {
      const me = await fetchMe();
      if (me.role !== "restaurant" && me.role !== "admin") {
        router.replace("/");
        return;
      }
      setUser(me);
      const list = await listMyApplications();
      setApps(list);
      setSelectedId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selected) setDraft(toDraft(selected));
      else setDraft(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const app = await createApplication();
      setApps((prev) => [app, ...prev]);
      setSelectedId(app.id);
      setMsg("Черновик создан");
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Не удалось создать");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!selected || !draft || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const cuisine = draft.cuisine
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateApplication(selected.id, {
        name: emptyLocalized(draft.name),
        description: emptyLocalized(draft.description),
        address: emptyLocalized(draft.address),
        cuisine,
        phone: draft.phone,
        hours_text: draft.hours_text,
        email: draft.email,
      });
      setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setMsg("Сохранено");
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!selected || !draft || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const cuisine = draft.cuisine
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await updateApplication(selected.id, {
        name: emptyLocalized(draft.name),
        description: emptyLocalized(draft.description),
        address: emptyLocalized(draft.address),
        cuisine,
        phone: draft.phone,
        hours_text: draft.hours_text,
        email: draft.email,
      });
      const updated = await submitApplication(selected.id);
      setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setMsg("Отправлено на модерацию");
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка отправки");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | null) {
    if (!selected || !file || !editable(selected.status)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadApplicationPhoto(selected.id, file);
      setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка загрузки фото");
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto(url: string) {
    if (!selected || !editable(selected.status)) return;
    setBusy(true);
    try {
      const updated = await removeApplicationPhoto(selected.id, url);
      setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "Ошибка удаления");
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

  const canEdit = selected ? editable(selected.status) : false;

  return (
    <PanelShell
      title="Кабинет ресторана"
      subtitle="Заявки на публикацию заведения"
      email={user.email}
    >
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="panel-btn"
          disabled={busy}
          onClick={() => void onCreate()}
        >
          + Новая заявка
        </button>
      </div>

      {msg && (
        <p style={{ color: "#86efac", fontSize: 14, marginBottom: 12 }}>{msg}</p>
      )}
      {error && <p className="auth-error">{error}</p>}

      {apps.length === 0 ? (
        <p className="panel-empty">
          Пока нет заявок. Создайте первую, заполните карточку и отправьте на
          модерацию.
        </p>
      ) : (
        <div className="panel-grid">
          <div className="app-list">
            {apps.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`app-list-item ${a.id === selectedId ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(a.id);
                  setMsg(null);
                  setError(null);
                }}
              >
                <h3>{pickLocale(a.name, "ru") || "Без названия"}</h3>
                <StatusBadge status={a.status} />
                <div className="app-list-meta" style={{ marginTop: 8 }}>
                  {new Date(a.updated_at).toLocaleDateString("ru")}
                </div>
              </button>
            ))}
          </div>

          {selected && draft && (
            <div className="panel-form">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <StatusBadge status={selected.status} />
                {selected.reject_reason && (
                  <span style={{ color: "#fca5a5", fontSize: 13 }}>
                    {selected.reject_reason}
                  </span>
                )}
              </div>

              <div className="field">
                <label>Название</label>
                <input
                  disabled={!canEdit}
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                  }
                />
              </div>
              <div className="field">
                <label>Описание</label>
                <textarea
                  disabled={!canEdit}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, description: e.target.value } : d,
                    )
                  }
                />
              </div>
              <div className="field">
                <label>Адрес</label>
                <input
                  disabled={!canEdit}
                  value={draft.address}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, address: e.target.value } : d))
                  }
                />
              </div>
              <div className="field">
                <label>Кухня (через запятую)</label>
                <input
                  disabled={!canEdit}
                  value={draft.cuisine}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, cuisine: e.target.value } : d))
                  }
                />
              </div>
              <div className="field">
                <label>Телефон</label>
                <input
                  disabled={!canEdit}
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, phone: e.target.value } : d))
                  }
                />
              </div>
              <div className="field">
                <label>Email заведения</label>
                <input
                  disabled={!canEdit}
                  type="email"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, email: e.target.value } : d))
                  }
                />
              </div>
              <div className="field">
                <label>Часы работы</label>
                <input
                  disabled={!canEdit}
                  placeholder="Пн–Пт 10:00–22:00"
                  value={draft.hours_text}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, hours_text: e.target.value } : d,
                    )
                  }
                />
              </div>

              <div className="field">
                <label>Фото</label>
                <div className="photo-grid">
                  {(selected.photo_urls || []).map((url) => (
                    <div key={url} className="photo-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(url)} alt="" />
                      {canEdit && (
                        <button
                          type="button"
                          aria-label="Удалить"
                          onClick={() => void onRemovePhoto(url)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ marginTop: 10 }}
                    onChange={(e) => {
                      void onPhoto(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                )}
              </div>

              {canEdit && (
                <div className="panel-form-actions">
                  <button
                    type="button"
                    className="panel-btn ghost"
                    disabled={busy}
                    onClick={() => void onSave()}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="panel-btn"
                    disabled={busy || !draft.name.trim()}
                    onClick={() => void onSubmit()}
                  >
                    Отправить на модерацию
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}
