"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  FloorPlanEditor,
  tablesToDraft,
  type FloorDraftTable,
} from "@/components/floor-plan-editor";
import { BookingRulesForm } from "@/components/booking-rules-form";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";
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

const CATEGORY_NAMES: Record<string, { ru: string; ro: string; en: string }> = {
  Закуски: { ru: "Закуски", ro: "Gustări", en: "Appetizers" },
  Супы: { ru: "Супы", ro: "Supe", en: "Soups" },
  Салаты: { ru: "Салаты", ro: "Salate", en: "Salads" },
  Основное: { ru: "Основное", ro: "Feluri principale", en: "Mains" },
  Десерты: { ru: "Десерты", ro: "Deserturi", en: "Desserts" },
  Напитки: { ru: "Напитки", ro: "Băuturi", en: "Drinks" },
  Бар: { ru: "Бар", ro: "Bar", en: "Bar" },
};

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
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<FloorDraftTable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<MenuForm>(emptyForm);
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
          if (!cancelled) {
            setMessage(
              locale === "ro"
                ? "Eroare la încărcarea datelor operaționale"
                : locale === "en"
                ? "Failed to load operational data"
                : "Не удалось загрузить операционные данные",
            );
          }
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
      setMessage(
        locale === "ro"
          ? "Eroare la executarea operațiunii"
          : locale === "en"
          ? "Operation error"
          : "Ошибка операции",
      );
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
    }, form.id ? (locale === "ro" ? "Preparat actualizat" : locale === "en" ? "Dish updated" : "Блюдо обновлено") : (locale === "ro" ? "Preparat adăugat" : locale === "en" ? "Dish added" : "Блюдо добавлено"));
  }

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    label: CATEGORY_NAMES[cat]?.[locale] || cat,
    items: menu.filter((m) => (m.category.ru || m.category.en) === cat),
  })).filter((g) => g.items.length > 0);

  const other = menu.filter(
    (m) => !CATEGORIES.includes(m.category.ru || m.category.en || ""),
  );

  return (
    <div className="cabinet-ops">
      {message && (
        <div className="owner-notice success" role="alert">
          <span>✓</span>
          <p>{message}</p>
        </div>
      )}
      {busy && (
        <p className="fa-muted">
          {locale === "ro" ? "Se încarcă…" : locale === "en" ? "Loading…" : "Загрузка…"}
        </p>
      )}

      {/* Floor Plan Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head cabinet-ops-floor-head">
          <div>
            <span className="owner-kicker">{copy.opsTitle}</span>
            <h3>{copy.opsFloorPlan}</h3>
            <p className="cabinet-ops-sub">
              {copy.opsFloorPlanHint}
              {dirty ? ` · ${copy.opsUnsavedChanges}` : ""}
            </p>
          </div>
          <div className="cabinet-ops-floor-actions">
            <button
              type="button"
              className="panel-btn ghost"
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(tablesToDraft(tables));
                setDirty(false);
                setMessage(
                  locale === "ro"
                    ? "Modificările au fost anulate"
                    : locale === "en"
                    ? "Changes reset"
                    : "Изменения отменены",
                );
              }}
            >
              {copy.opsFloorPlanReset}
            </button>
            <button
              type="button"
              className="panel-btn"
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
                }, locale === "ro" ? "Planul sălii a fost salvat" : locale === "en" ? "Floor plan saved" : "План зала сохранён")
              }
            >
              {copy.opsFloorPlanSave}
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
            <summary>{copy.opsQrTitle} ({tables.length})</summary>
            <p className="cabinet-ops-sub">{copy.opsQrHint}</p>
            <div className="cabinet-qr-grid">
              {tables.map((t) => {
                const payload = `${venueId}:${t.id}:${t.qr_token || "demo"}`;
                return (
                  <figure key={t.id} className="cabinet-qr-card">
                    <QRCodeSVG value={payload} size={132} level="M" />
                    <figcaption>
                      <strong>{copy.table} {t.number}</strong>
                      <code>{payload}</code>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="cabinet-qr-actions">
              <button
                type="button"
                className="panel-btn ghost"
                onClick={() => window.print()}
              >
                {copy.opsQrPrint}
              </button>
              <button
                type="button"
                className="panel-btn ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await regenerateVenueQR(venueId);
                  }, locale === "ro" ? "Codurile QR au fost actualizate" : locale === "en" ? "QRs regenerated" : "QR обновлены")
                }
              >
                {copy.opsQrRegen}
              </button>
            </div>
          </details>
        )}
      </section>

      {/* Menu Management Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.opsTitle}</span>
            <h3>{copy.opsMenuTitle}</h3>
            <p className="cabinet-ops-sub">{copy.opsMenuHint}</p>
          </div>
        </div>

        <form
          className="cabinet-menu-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDish();
          }}
        >
          <div className="field">
            <label htmlFor="menu-dish-name">{copy.opsMenuNamePlaceholder}</label>
            <input
              id="menu-dish-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={copy.opsMenuNamePlaceholder}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="menu-dish-cat">{locale === "ro" ? "Categorie" : locale === "en" ? "Category" : "Категория"}</label>
            <select
              id="menu-dish-cat"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_NAMES[c]?.[locale] || c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="menu-dish-price">{copy.opsMenuPricePlaceholder}</label>
            <input
              id="menu-dish-price"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder={copy.opsMenuPricePlaceholder}
              inputMode="numeric"
              required
            />
          </div>
          <div className="field owner-field-wide">
            <label htmlFor="menu-dish-desc">{copy.opsMenuDescPlaceholder}</label>
            <textarea
              id="menu-dish-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={copy.opsMenuDescPlaceholder}
              rows={2}
            />
          </div>
          <label className="cabinet-menu-check owner-field-wide">
            <input
              type="checkbox"
              checked={form.alcohol}
              onChange={(e) => setForm((f) => ({ ...f, alcohol: e.target.checked }))}
            />
            <span>{copy.opsMenuAlcohol}</span>
          </label>
          <div className="cabinet-ops-row owner-field-wide">
            <button
              type="submit"
              className="panel-btn"
              disabled={busy || !form.name.trim()}
            >
              {form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}
            </button>
            {form.id ? (
              <button
                type="button"
                className="panel-btn ghost"
                disabled={busy}
                onClick={() => setForm(emptyForm())}
              >
                {locale === "ro" ? "Anulează" : locale === "en" ? "Cancel" : "Отмена"}
              </button>
            ) : null}
          </div>
        </form>

        {menu.length === 0 ? (
          <p className="cabinet-ops-empty">{copy.opsMenuEmpty}</p>
        ) : (
          <div className="cabinet-menu-list">
            {[...grouped, ...(other.length ? [{ cat: "other", label: locale === "ro" ? "Altele" : locale === "en" ? "Other" : "Другое", items: other }] : [])].map(
              (group) => (
                <div key={group.cat} className="cabinet-menu-group">
                  <h4>{group.label}</h4>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id} className={item.stopped ? "stopped" : ""}>
                        <div>
                          <strong>
                            {item.name.ru || item.name.en}
                            {item.contains_alcohol ? " · 18+" : ""}
                          </strong>
                          <span className="cabinet-dish-price">
                            {item.price} MDL
                            {item.stopped ? ` · ${copy.opsMenuStop.toLowerCase()}` : ""}
                          </span>
                          {item.description.ru ? <p>{item.description.ru}</p> : null}
                        </div>
                        <div className="cabinet-menu-actions">
                          <button
                            type="button"
                            className="panel-btn ghost sm"
                            onClick={() => editItem(item)}
                          >
                            {copy.opsMenuEdit}
                          </button>
                          <button
                            type="button"
                            className="panel-btn ghost sm"
                            onClick={() =>
                              run(async () => {
                                await stopOwnerMenuItem(venueId, item.id, !item.stopped);
                              }, locale === "ro" ? "Stop-list actualizat" : locale === "en" ? "Stop-list updated" : "Стоп-лист обновлён")
                            }
                          >
                            {item.stopped ? copy.opsMenuResume : copy.opsMenuStop}
                          </button>
                          <button
                            type="button"
                            className="panel-btn ghost sm danger"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `${locale === "ro" ? "Ștergeți" : locale === "en" ? "Delete" : "Удалить"} «${item.name.ru || item.name.en}»?`,
                                )
                              ) {
                                return;
                              }
                              void run(async () => {
                                await deleteOwnerMenuItem(venueId, item.id);
                                if (form.id === item.id) setForm(emptyForm());
                              }, locale === "ro" ? "Preparat șters" : locale === "en" ? "Dish removed" : "Блюдо удалено");
                            }}
                          >
                            {copy.opsMenuDelete}
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

      {/* Booking Rules Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.opsTitle}</span>
            <h3>{copy.opsRulesTitle}</h3>
          </div>
        </div>
        <BookingRulesForm venueId={venueId} />
      </section>

      {/* Staff Management Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.opsTitle}</span>
            <h3>{copy.opsStaffTitle}</h3>
          </div>
        </div>
        <div className="cabinet-ops-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={copy.opsStaffPlaceholder}
            type="email"
            inputMode="email"
            className="cabinet-staff-input"
          />
          <button
            type="button"
            className="panel-btn"
            disabled={busy || !email.trim()}
            onClick={() =>
              run(async () => {
                await inviteVenueStaff(venueId, email.trim());
                setEmail("");
              }, locale === "ro" ? "Invitația a fost expediată" : locale === "en" ? "Invitation sent" : "Приглашение отправлено")
            }
          >
            {copy.opsStaffInvite}
          </button>
        </div>
        <ul className="cabinet-staff-list">
          {staff.map((member) => (
            <li key={member.id}>
              <strong>{member.email}</strong>
              <span>· {member.role} · {member.status}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Shift Analytics Section */}
      {analytics && (
        <section className="owner-card cabinet-ops-card">
          <div className="owner-card-head">
            <div>
              <span className="owner-kicker">{copy.opsTitle}</span>
              <h3>{copy.opsAnalyticsTitle}</h3>
            </div>
          </div>
          <div className="owner-metrics" style={{ margin: 0 }}>
            <article>
              <span>{locale === "ro" ? "Total mese" : locale === "en" ? "Total tables" : "Всего столов"}</span>
              <strong>{analytics.total_tables}</strong>
            </article>
            <article>
              <span>{locale === "ro" ? "Mese libere" : locale === "en" ? "Free tables" : "Свободно столов"}</span>
              <strong>{analytics.free_tables}</strong>
            </article>
            <article>
              <span>{locale === "ro" ? "Chemări chelner" : locale === "en" ? "Waiter calls" : "Вызовы официанта"}</span>
              <strong>{analytics.waiter_calls_pending}</strong>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
