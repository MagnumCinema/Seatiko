"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  FloorPlanEditor,
  tablesToDraft,
  type FloorDraftTable,
} from "@/components/floor-plan-editor";
import { BookingRulesForm } from "@/components/booking-rules-form";
import { useLocale } from "@/components/locale-provider";
import { LeafIcon, FlameIcon } from "@/components/venue-icons";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";
import {
  deleteOwnerMenuItem,
  emptyLocalized,
  fetchVenueAnalytics,
  inviteVenueStaff,
  listOwnerMenu,
  listVenueQR,
  listVenueStaff,
  mediaUrl,
  pickLocale,
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
  image_url: string;
  weight_g: string;
  allergens: string;
  isPopular: boolean;
  isVeg: boolean;
  isSpicy: boolean;
};

const emptyForm = (defaultCategory = "Основное"): MenuForm => ({
  name: "",
  category: defaultCategory,
  description: "",
  price: "80",
  alcohol: false,
  image_url: "",
  weight_g: "",
  allergens: "",
  isPopular: false,
  isVeg: false,
  isSpicy: false,
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
  const [form, setForm] = useState<MenuForm>(() => emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingDish, setDeletingDish] = useState<MenuItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const modalRef = useRef<HTMLElement>(null);
  const deleteModalRef = useRef<HTMLElement>(null);

  useDialogFocus(isModalOpen, modalRef, () => setIsModalOpen(false));
  useDialogFocus(!!deletingDish, deleteModalRef, () => setDeletingDish(null));

  useEffect(() => {
    if (!isModalOpen && !deletingDish) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isModalOpen, deletingDish]);

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
    const tags = item.tags ?? [];
    const allergens = item.allergens ?? [];
    setForm({
      id: item.id,
      name: item.name.ru || item.name.en || "",
      category: item.category.ru || item.category.en || "Основное",
      description: item.description.ru || item.description.en || "",
      price: String(item.price),
      alcohol: !!item.contains_alcohol,
      image_url: item.image_url || "",
      weight_g: item.weight_g ? String(item.weight_g) : "",
      allergens: allergens.join(", "),
      isPopular: tags.includes("popular"),
      isVeg: tags.includes("vegetarian"),
      isSpicy: tags.includes("spicy"),
    });
    setIsModalOpen(true);
  }

  function openAddDish() {
    setForm(emptyForm(selectedCategory !== "all" ? selectedCategory : "Основное"));
    setIsModalOpen(true);
  }

  async function saveDish() {
    const name = form.name.trim();
    if (!name) return;
    const tags: string[] = [];
    if (form.isPopular) tags.push("popular");
    if (form.isVeg) tags.push("vegetarian");
    if (form.isSpicy) tags.push("spicy");

    const allergens = form.allergens
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload: Partial<MenuItem> & { name: { ru: string; en: string; ro: string }; price: number } = {
      name: emptyLocalized(name),
      category: emptyLocalized(form.category.trim() || "Основное"),
      description: emptyLocalized(form.description.trim()),
      price: Number(form.price) || 0,
      contains_alcohol: form.alcohol,
      image_url: form.image_url.trim() || undefined,
      weight_g: form.weight_g ? Number(form.weight_g) : undefined,
      tags,
      allergens: allergens.length > 0 ? allergens : undefined,
    };

    await run(async () => {
      if (form.id) {
        await updateOwnerMenuItem(venueId, form.id, payload);
      } else {
        await upsertOwnerMenuItem(venueId, payload);
      }
      setIsModalOpen(false);
      setForm(emptyForm());
    }, form.id ? (locale === "ro" ? "Preparat actualizat" : locale === "en" ? "Dish updated" : "Блюдо обновлено") : (locale === "ro" ? "Preparat adăugat" : locale === "en" ? "Dish added" : "Блюдо добавлено"));
  }

  async function handleDeleteDish() {
    if (!deletingDish) return;
    const dish = deletingDish;
    await run(async () => {
      await deleteOwnerMenuItem(venueId, dish.id);
      if (form.id === dish.id) {
        setIsModalOpen(false);
        setForm(emptyForm());
      }
      setDeletingDish(null);
    }, locale === "ro" ? "Preparat șters" : locale === "en" ? "Dish removed" : "Блюдо удалено");
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

      {/* Menu Catalog & Stop List */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head" style={{ marginBottom: 16 }}>
          <div>
            <span className="owner-kicker">{copy.menu}</span>
            <h3>{copy.menuSectionTitle} ({menu.length})</h3>
            <p className="cabinet-ops-sub">{copy.menuSectionSubtitle}</p>
          </div>
          <div className="cabinet-menu-head-actions">
            <input
              type="search"
              placeholder={locale === "ro" ? "Caută preparat…" : locale === "en" ? "Search dish…" : "Поиск блюда…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cabinet-search-input"
            />
            <button
              type="button"
              className="panel-btn primary"
              onClick={openAddDish}
            >
              + {copy.opsMenuAddDish}
            </button>
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
          <div className="cabinet-ops-empty" style={{ textAlign: "center", padding: "32px 16px" }}>
            <p>{copy.opsMenuEmpty}</p>
            <button
              type="button"
              className="panel-btn primary"
              onClick={openAddDish}
              style={{ marginTop: 14 }}
            >
              + {copy.opsMenuAddDish}
            </button>
          </div>
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
                        </span>
                        {item.stopped ? (
                          <span className="cabinet-dish-stop-badge">
                            {copy.opsMenuStop}
                          </span>
                        ) : null}
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
                          onClick={() => setDeletingDish(item)}
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

      {/* Dish Edit / Add Modal Popup matching Client Dish Details */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root menu-dish-popup-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setIsModalOpen(false)}
          />
          <section
            ref={modalRef}
            className="booking-popup menu-dish-popup cabinet-dish-popup"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}
            aria-labelledby="cabinet-dish-popup-title"
          >
            <div className="booking-popup-card menu-dish-popup-card cabinet-dish-popup-card">
              <button
                type="button"
                className="booking-popup-x menu-dish-popup-x"
                onClick={() => setIsModalOpen(false)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <div className="menu-dish-popup-layout cabinet-dish-edit-layout">
                {/* Media column */}
                <div className="cabinet-dish-edit-media">
                  {form.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(form.image_url)} alt={form.name || "Dish photo"} />
                  ) : (
                    <div className="cabinet-dish-media-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                        <circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                      </svg>
                      <span>{copy.opsMenuNoPhoto}</span>
                    </div>
                  )}
                  <div className="cabinet-dish-media-input-bar">
                    <label htmlFor="edit-dish-photo">{copy.opsMenuPhotoUrl}</label>
                    <input
                      id="edit-dish-photo"
                      value={form.image_url}
                      onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                      placeholder={copy.opsMenuPhotoPlaceholder}
                    />
                  </div>
                </div>

                {/* Form fields column */}
                <form
                  className="menu-dish-popup-copy"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveDish();
                  }}
                >
                  <div className="menu-dish-popup-top">
                    <div>
                      <label htmlFor="edit-dish-name" className="sr-only">
                        {copy.opsMenuNamePlaceholder}
                      </label>
                      <input
                        id="edit-dish-name"
                        className="cabinet-dish-title-input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={copy.opsMenuNamePlaceholder}
                        required
                        data-autofocus
                      />
                    </div>

                    <div className="cabinet-dish-meta-grid">
                      <div className="cabinet-dish-field-wrap">
                        <label htmlFor="edit-dish-cat">{copy.opsMenuCategoryLabel}</label>
                        <select
                          id="edit-dish-cat"
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
                      <div className="cabinet-dish-field-wrap">
                        <label htmlFor="edit-dish-weight">{copy.opsMenuWeight}</label>
                        <input
                          id="edit-dish-weight"
                          type="number"
                          min="0"
                          placeholder="300"
                          value={form.weight_g}
                          onChange={(e) => setForm((f) => ({ ...f, weight_g: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="cabinet-dish-tag-buttons">
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.alcohol ? "active adult" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, alcohol: !f.alcohol }))}
                      >
                        {copy.opsMenuAlcohol}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isPopular ? "active popular" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isPopular: !f.isPopular }))}
                      >
                        ★ {copy.opsMenuPopular}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isVeg ? "active veg" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isVeg: !f.isVeg }))}
                      >
                        <LeafIcon className="menu-tag-icon" /> {copy.opsMenuVeg}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isSpicy ? "active spicy" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isSpicy: !f.isSpicy }))}
                      >
                        <FlameIcon className="menu-tag-icon" /> {copy.opsMenuSpicy}
                      </button>
                    </div>
                  </div>

                  <div className="menu-dish-popup-block">
                    <h3>{copy.opsMenuDescPlaceholder}</h3>
                    <textarea
                      id="edit-dish-desc"
                      className="cabinet-dish-desc-textarea"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder={copy.opsMenuDescPlaceholder}
                    />
                  </div>

                  <div className="menu-dish-popup-allergens">
                    <span className="menu-dish-popup-alert" aria-hidden="true">
                      !
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>{copy.opsMenuAllergens}</strong>
                      <input
                        id="edit-dish-allergens"
                        className="cabinet-dish-allergens-input"
                        value={form.allergens}
                        onChange={(e) => setForm((f) => ({ ...f, allergens: e.target.value }))}
                        placeholder={copy.opsMenuAllergensPlaceholder}
                      />
                    </div>
                  </div>

                  <div className="cabinet-dish-actions-bar">
                    <div className="cabinet-dish-price-input-box">
                      <label htmlFor="edit-dish-price" className="sr-only">
                        {copy.opsMenuPricePlaceholder}
                      </label>
                      <span className="cabinet-dish-price-prefix">{copy.opsMenuPriceLabel}</span>
                      <input
                        id="edit-dish-price"
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                        placeholder="0"
                      />
                      <span className="cabinet-dish-currency">MDL</span>
                    </div>

                    <button
                      type="submit"
                      className="venue-cta venue-cta-hero cabinet-dish-save-cta"
                      disabled={busy || !form.name.trim()}
                    >
                      <span>{form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}</span>
                      <b>
                        {form.price || 0} <small>MDL</small>
                      </b>
                    </button>

                    <button
                      type="button"
                      className="cabinet-dish-cancel-btn"
                      onClick={() => setIsModalOpen(false)}
                      disabled={busy}
                    >
                      {copy.opsMenuCancel}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Custom Delete Confirmation Modal Popup */}
      {deletingDish && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setDeletingDish(null)}
          />
          <section
            ref={deleteModalRef}
            className="booking-popup cabinet-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-delete-title"
          >
            <div className="booking-popup-card cabinet-delete-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setDeletingDish(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>
              <div className="cabinet-delete-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 id="cabinet-delete-title">{copy.opsMenuDeleteConfirmTitle}</h3>
              <p className="cabinet-delete-text">
                {copy.opsMenuDeleteConfirmText.replace(
                  "{name}",
                  pickLocale(deletingDish.name, locale) || deletingDish.name.ru || deletingDish.name.en || "",
                )}
              </p>
              <div className="cabinet-delete-actions">
                <button
                  type="button"
                  className="panel-btn danger"
                  disabled={busy}
                  onClick={() => void handleDeleteDish()}
                >
                  {copy.opsMenuDeleteConfirmBtn}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost"
                  data-autofocus
                  disabled={busy}
                  onClick={() => setDeletingDish(null)}
                >
                  {copy.opsMenuCancel}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
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
