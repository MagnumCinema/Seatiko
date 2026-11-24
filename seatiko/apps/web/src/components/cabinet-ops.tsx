"use client";

import { useEffect, useMemo, useState } from "react";
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

/**
 * Floor & Hall Management Panel (Floor plan, QR codes, Booking rules, Staff, Shift analytics)
 */
export function CabinetFloorPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<FloorDraftTable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [qr, members, stats] = await Promise.all([
      listVenueQR(venueId),
      listVenueStaff(venueId),
      fetchVenueAnalytics(venueId),
    ]);
    setTables(qr);
    setDraft(tablesToDraft(qr));
    setDirty(false);
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
                ? "Eroare la încărcarea datelor sălii"
                : locale === "en"
                ? "Failed to load floor data"
                : "Не удалось загрузить данные зала",
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
            <span className="owner-kicker">{copy.floor}</span>
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
          <details className="cabinet-ops-qr" open>
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

      {/* Booking Rules Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.floor}</span>
            <h3>{copy.opsRulesTitle}</h3>
          </div>
        </div>
        <BookingRulesForm venueId={venueId} />
      </section>

      {/* Staff Management Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.floor}</span>
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
              <span className="owner-kicker">{copy.floor}</span>
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

/**
 * Menu & Stop-List Management Panel
 */
export function CabinetMenuPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState<MenuForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const items = await listOwnerMenu(venueId);
    setMenu(items);
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
                ? "Eroare la încărcarea meniului"
                : locale === "en"
                ? "Failed to load menu"
                : "Не удалось загрузить меню",
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
          ? "Eroare la salvare"
          : locale === "en"
          ? "Save error"
          : "Ошибка сохранения",
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
    // Scroll smoothly to form
    const formElem = document.getElementById("cabinet-menu-form-anchor");
    if (formElem) formElem.scrollIntoView({ behavior: "smooth" });
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

  const filteredDishes = useMemo(() => {
    return menu.filter((item) => {
      const matchCat =
        selectedCategory === "all" ||
        (item.category.ru || item.category.en) === selectedCategory;
      const matchQuery =
        !searchQuery.trim() ||
        (item.name.ru || item.name.en || "")
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase()) ||
        (item.description.ru || item.description.en || "")
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());
      return matchCat && matchQuery;
    });
  }, [menu, selectedCategory, searchQuery]);

  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      cat,
      label: CATEGORY_NAMES[cat]?.[locale] || cat,
      items: filteredDishes.filter((m) => (m.category.ru || m.category.en) === cat),
    })).filter((g) => g.items.length > 0);
  }, [filteredDishes, locale]);

  const otherDishes = useMemo(() => {
    return filteredDishes.filter(
      (m) => !CATEGORIES.includes(m.category.ru || m.category.en || ""),
    );
  }, [filteredDishes]);

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

      {/* Menu Form Card */}
      <section id="cabinet-menu-form-anchor" className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.menu}</span>
            <h3>{form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}</h3>
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
              enterKeyHint="next"
            />
          </div>
          <div className="field">
            <label htmlFor="menu-dish-cat">
              {locale === "ro" ? "Categorie" : locale === "en" ? "Category" : "Категория"}
            </label>
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
              enterKeyHint="next"
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
      </section>

      {/* Menu Catalog & Stop List */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head" style={{ marginBottom: 16 }}>
          <div>
            <span className="owner-kicker">{copy.menu}</span>
            <h3>{copy.menuSectionTitle} ({menu.length})</h3>
            <p className="cabinet-ops-sub">{copy.menuSectionSubtitle}</p>
          </div>
          <div className="cabinet-menu-search">
            <input
              type="search"
              placeholder={locale === "ro" ? "Caută preparat…" : locale === "en" ? "Search dish…" : "Поиск блюда…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cabinet-search-input"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="cabinet-category-pills" role="group" aria-label="Категории меню">
          <button
            type="button"
            className={selectedCategory === "all" ? "active" : ""}
            onClick={() => setSelectedCategory("all")}
          >
            {locale === "ro" ? "Toate" : locale === "en" ? "All" : "Все"} ({menu.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = menu.filter((m) => (m.category.ru || m.category.en) === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                className={selectedCategory === cat ? "active" : ""}
                onClick={() => setSelectedCategory(cat)}
              >
                {CATEGORY_NAMES[cat]?.[locale] || cat} ({count})
              </button>
            );
          })}
        </div>

        {menu.length === 0 ? (
          <p className="cabinet-ops-empty">{copy.opsMenuEmpty}</p>
        ) : filteredDishes.length === 0 ? (
          <p className="cabinet-ops-empty">
            {locale === "ro" ? "Niciun preparat găsit" : locale === "en" ? "No dishes found" : "Ничего не найдено"}
          </p>
        ) : (
          <div className="cabinet-menu-list">
            {[
              ...grouped,
              ...(otherDishes.length
                ? [{ cat: "other", label: locale === "ro" ? "Altele" : locale === "en" ? "Other" : "Другое", items: otherDishes }]
                : []),
            ].map((group) => (
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Combined operations panel for backwards compatibility
 */
export function CabinetOpsPanel({ venueId }: Props) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <CabinetFloorPanel venueId={venueId} />
      <CabinetMenuPanel venueId={venueId} />
    </div>
  );
}
