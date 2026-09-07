"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  FloorPlanEditor,
  tablesToDraft,
  type FloorDraftTable,
} from "@/components/floor-plan-editor";
import {
  deleteOwnerMenuItem,
  emptyLocalized,
  fetchVenueAnalytics,
  inviteVenueStaff,
  listOwnerMenu,
  listVenueQR,
  listVenueStaff,
  regenerateVenueQR,
  replaceVenueTables,
  stopOwnerMenuItem,
  updateBookingRules,
  updateOwnerMenuItem,
  upsertOwnerMenuItem,
  type MenuItem,
  type StaffMember,
  type Table,
  type VenueAnalytics,
} from "@/lib/api";

type Props = { venueId: string };

const CATEGORIES = [
  "Закуски",
  "Супы",
  "Салаты",
  "Основное",
  "Десерты",
  "Напитки",
  "Бар",
];

type MenuForm = {
  id?: string;
  name: string;
  category: string;
  description: string;
  price: string;
  alcohol: boolean;
};

const emptyForm = (): MenuForm => ({
  name: "",
  category: "Основное",
  description: "",
  price: "80",
  alcohol: false,
});

export function CabinetOpsPanel({ venueId }: Props) {
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<FloorDraftTable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<MenuForm>(emptyForm);
  const [interval, setIntervalMin] = useState("30");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [qr, items, members, stats] = await Promise.all([
      listVenueQR(venueId),
      listOwnerMenu(venueId),
      listVenueStaff(venueId),
      fetchVenueAnalytics(venueId),
    ]);
    setTables(qr);
    setDraft(tablesToDraft(qr));
    setDirty(false);
    setMenu(items);
    setStaff(members);
    setAnalytics(stats);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload()
        .catch(() => {
          if (!cancelled) setMessage("Не удалось загрузить операционные данные");
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage(ok);
    } catch {
      setMessage("Ошибка операции");
    } finally {
      setBusy(false);
    }
  }

  function editItem(item: MenuItem) {
    setForm({
      id: item.id,
      name: item.name.ru || item.name.en || "",
      category: item.category.ru || item.category.en || "Основное",
      description: item.description.ru || item.description.en || "",
      price: String(item.price),
      alcohol: item.contains_alcohol,
    });
  }

  async function saveDish() {
    const name = form.name.trim();
    if (!name) return;
    const payload = {
      name: emptyLocalized(name),
      category: emptyLocalized(form.category.trim() || "Основное"),
      description: emptyLocalized(form.description.trim()),
      price: Number(form.price) || 0,
      contains_alcohol: form.alcohol,
    };
    await run(async () => {
      if (form.id) {
        await updateOwnerMenuItem(venueId, form.id, payload);
      } else {
        await upsertOwnerMenuItem(venueId, payload);
      }
      setForm(emptyForm());
    }, form.id ? "Блюдо обновлено" : "Блюдо добавлено");
  }

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: menu.filter((m) => (m.category.ru || m.category.en) === cat),
  })).filter((g) => g.items.length > 0);
  const other = menu.filter(
    (m) => !CATEGORIES.includes(m.category.ru || m.category.en || ""),
  );

  return (
    <div className="cabinet-ops">
      <h2>Операции заведения</h2>
      {message && <p className="fa-muted">{message}</p>}
      {busy && <p className="fa-muted">Загрузка…</p>}

      <section className="cabinet-ops-floor">
        <div className="cabinet-ops-floor-head">
          <div>
            <h3>Карта зала</h3>
            <p className="fa-muted">
              Создайте план сами: перетаскивайте столы, меняйте места, сохраняйте.
              {dirty ? " · есть несохранённые изменения" : ""}
            </p>
          </div>
          <div className="cabinet-ops-floor-actions">
            <button
              type="button"
              className="fa-btn fa-btn-outline"
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(tablesToDraft(tables));
                setDirty(false);
                setMessage("Изменения отменены");
              }}
            >
              Сбросить
            </button>
            <button
              type="button"
              className="fa-btn"
              disabled={busy || draft.length === 0}
              onClick={() =>
                run(async () => {
                  await replaceVenueTables(
                    venueId,
                    draft.map((t) => ({
                      number: t.number,
                      seats: t.seats,
                      x: t.x,
                      y: t.y,
                      zone: t.zone || "hall",
                    })),
                  );
                }, "План зала сохранён")
              }
            >
              Сохранить план
            </button>
          </div>
        </div>
        <FloorPlanEditor
          tables={draft}
          busy={busy}
          onChange={(next) => {
            setDraft(next);
            setDirty(true);
          }}
        />
        {tables.length > 0 && (
          <details className="cabinet-ops-qr">
            <summary>QR-коды столов ({tables.length})</summary>
            <p className="fa-muted">
              Распечатайте и поставьте на столы — гость наводит камеру в
              приложении и сразу открывает стол.
            </p>
            <div className="cabinet-qr-grid">
              {tables.map((t) => {
                const payload = `${venueId}:${t.id}:${t.qr_token || "demo"}`;
                return (
                  <figure key={t.id} className="cabinet-qr-card">
                    <QRCodeSVG value={payload} size={132} level="M" />
                    <figcaption>
                      <strong>Стол {t.number}</strong>
                      <code>{payload}</code>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="cabinet-qr-actions">
              <button
                type="button"
                className="fa-btn fa-btn-outline"
                onClick={() => window.print()}
              >
                Печать
              </button>
              <button
                type="button"
                className="fa-btn fa-btn-outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await regenerateVenueQR(venueId);
                  }, "QR обновлены")
                }
              >
                Перевыпустить QR
              </button>
            </div>
          </details>
        )}
      </section>

      <section className="cabinet-ops-menu">
        <div className="cabinet-ops-floor-head">
          <div>
            <h3>Меню ресторана</h3>
            <p className="fa-muted">
              Гости видят это меню на сайте и в приложении. Стоп-лист скрывает
              блюдо у гостей.
            </p>
          </div>
        </div>

        <div className="cabinet-menu-form">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Название блюда"
          />
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value }))
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="Цена, MDL"
            inputMode="numeric"
          />
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Краткое описание (необязательно)"
            rows={2}
          />
          <label className="cabinet-menu-check">
            <input
              type="checkbox"
              checked={form.alcohol}
              onChange={(e) =>
                setForm((f) => ({ ...f, alcohol: e.target.checked }))
              }
            />
            Содержит алкоголь (18+)
          </label>
          <div className="cabinet-ops-row">
            <button
              type="button"
              className="fa-btn"
              disabled={busy || !form.name.trim()}
              onClick={() => void saveDish()}
            >
              {form.id ? "Сохранить изменения" : "Добавить блюдо"}
            </button>
            {form.id ? (
              <button
                type="button"
                className="fa-btn fa-btn-outline"
                disabled={busy}
                onClick={() => setForm(emptyForm())}
              >
                Отмена
              </button>
            ) : null}
          </div>
        </div>

        {menu.length === 0 ? (
          <p className="fa-muted">
            Меню пустое — добавьте 5–10 блюд, чтобы гости могли выбрать заранее.
          </p>
        ) : (
          <div className="cabinet-menu-list">
            {[...grouped, ...(other.length ? [{ cat: "Другое", items: other }] : [])].map(
              (group) => (
                <div key={group.cat} className="cabinet-menu-group">
                  <h4>{group.cat}</h4>
                  <ul>
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className={item.stopped ? "stopped" : ""}
                      >
                        <div>
                          <strong>
                            {item.name.ru || item.name.en}
                            {item.contains_alcohol ? " · 18+" : ""}
                          </strong>
                          <span>
                            {item.price} MDL
                            {item.stopped ? " · стоп" : ""}
                          </span>
                          {item.description.ru ? (
                            <p>{item.description.ru}</p>
                          ) : null}
                        </div>
                        <div className="cabinet-menu-actions">
                          <button
                            type="button"
                            className="fa-btn fa-btn-outline"
                            onClick={() => editItem(item)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="fa-btn fa-btn-outline"
                            onClick={() =>
                              run(async () => {
                                await stopOwnerMenuItem(
                                  venueId,
                                  item.id,
                                  !item.stopped,
                                );
                              }, "Стоп-лист обновлён")
                            }
                          >
                            {item.stopped ? "Вернуть" : "Стоп"}
                          </button>
                          <button
                            type="button"
                            className="fa-btn fa-btn-outline danger"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Удалить «${item.name.ru || item.name.en}»?`,
                                )
                              ) {
                                return;
                              }
                              void run(async () => {
                                await deleteOwnerMenuItem(venueId, item.id);
                                if (form.id === item.id) setForm(emptyForm());
                              }, "Блюдо удалено");
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section>
        <h3>Правила брони</h3>
        <div className="cabinet-ops-row">
          <label>
            Интервал (мин)
            <input
              value={interval}
              onChange={(e) => setIntervalMin(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="fa-btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await updateBookingRules(venueId, {
                  booking_interval_min: Number(interval) || 30,
                });
              }, "Правила обновлены")
            }
          >
            Сохранить
          </button>
        </div>
      </section>

      <section>
        <h3>Персонал</h3>
        <div className="cabinet-ops-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email официанта"
          />
          <button
            type="button"
            className="fa-btn"
            disabled={busy || !email.trim()}
            onClick={() =>
              run(async () => {
                await inviteVenueStaff(venueId, email.trim());
                setEmail("");
              }, "Приглашение отправлено")
            }
          >
            Пригласить
          </button>
        </div>
        <ul>
          {staff.map((member) => (
            <li key={member.id}>
              {member.email} · {member.role} · {member.status}
            </li>
          ))}
        </ul>
      </section>

      {analytics && (
        <section>
          <h3>Аналитика</h3>
          <p className="fa-muted">
            Столов: {analytics.total_tables}, свободно: {analytics.free_tables},
            вызовов официанта: {analytics.waiter_calls_pending}
          </p>
        </section>
      )}
    </div>
  );
}
