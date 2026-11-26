"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { FloorPlanEditor } from "@/components/floor-plan-editor";
import {
  draftFromApi,
  draftToApi,
  layoutOf,
  planSignature,
  type FloorPlanState,
} from "@/lib/floor-layout";
import { readFloorLayout, writeFloorLayout } from "@/lib/floor-layout-store";
import { normalizeZone } from "@/lib/floor-zones";
import { useUndoHistory } from "@/lib/use-undo-history";
import { BookingRulesForm } from "@/components/booking-rules-form";
import { useLocale } from "@/components/locale-provider";
import { LeafIcon, FlameIcon } from "@/components/venue-icons";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { SelectMenu } from "@/components/ui/select-menu";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { getSiteCopy } from "@/lib/site-copy";
import {
  deleteOwnerMenuItem,
  emptyLocalized,
  listOwnerMenu,
  listVenueQR,
  mediaUrl,
  pickLocale,
  regenerateVenueQR,
  replaceVenueTables,
  stopOwnerMenuItem,
  updateOwnerMenuItem,
  upsertOwnerMenuItem,
  type MenuItem,
  type Table,
} from "@/lib/api";

type Props = { venueId: string };

type Notice = { kind: "success" | "error"; text: string };

function OpsNotice({ notice, onClose, closeLabel }: { notice: Notice | null; onClose: () => void; closeLabel: string }) {
  if (!notice) return null;
  return (
    <div
      className={`owner-notice ${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{notice.kind === "error" ? "!" : "✓"}</span>
      <p>{notice.text}</p>
      <button type="button" aria-label={closeLabel} onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** Success notices disappear after a few seconds; errors stay until closed. */
function useAutoHideNotice(notice: Notice | null, clear: () => void) {
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);
}

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

type Localized = { ru: string; en: string; ro: string };

/** Category key used for grouping: the Russian name, like the stored data. */
function categoryKey(item: MenuItem): string {
  return item.category.ru || item.category.en || item.category.ro || "";
}

/** Writes `value` into the current language, keeping the other translations; fills empty ones. */
function mergeLocalized(previous: Partial<Localized> | undefined, locale: string, value: string): Localized {
  const base = { ru: previous?.ru ?? "", en: previous?.en ?? "", ro: previous?.ro ?? "" };
  const original = base[locale as keyof Localized];
  const next = { ...base, [locale]: value } as Localized;
  // Languages that only mirrored the old text (or were empty) follow the edit.
  (["ru", "en", "ro"] as const).forEach((code) => {
    if (code !== locale && (!next[code] || next[code] === original)) next[code] = value;
  });
  return next;
}

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

const EMPTY_PLAN: FloorPlanState = { tables: [], fixtures: {} };
const FLOOR_DRAFT_PREFIX = "seatiko:floor-draft:";

/**
 * Unsaved edits survive switching cabinet tabs or a reload (sessionStorage), but only on top
 * of the same saved plan they started from; seated / reserved state comes from the server.
 */
function readFloorDraft(venueId: string, base: FloorPlanState): FloorPlanState | null {
  try {
    const raw = window.sessionStorage.getItem(FLOOR_DRAFT_PREFIX + venueId);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { base?: string; plan?: FloorPlanState };
    if (draft.base !== planSignature(base) || !draft.plan || !Array.isArray(draft.plan.tables)) return null;
    const live = new Map(base.tables.map((t) => [t.key, t]));
    return {
      fixtures: draft.plan.fixtures ?? {},
      tables: draft.plan.tables.map((t) => {
        const cur = live.get(t.key);
        return cur ? { ...t, status: cur.status, locked: cur.locked } : t;
      }),
    };
  } catch {
    return null;
  }
}

function writeFloorDraft(venueId: string, base: FloorPlanState, plan: FloorPlanState | null) {
  try {
    if (plan) {
      window.sessionStorage.setItem(FLOOR_DRAFT_PREFIX + venueId, JSON.stringify({ base: planSignature(base), plan }));
    } else {
      window.sessionStorage.removeItem(FLOOR_DRAFT_PREFIX + venueId);
    }
  } catch {
    // Storage may be unavailable (private mode); the draft just isn't kept.
  }
}

/** Editor state from the API tables plus the layout kept for this venue (bar, kitchen, entrance, rotation). */
function planFromTables(tables: Table[], layoutVenueId: string): FloorPlanState {
  const layout = readFloorLayout(layoutVenueId);
  const rotated = new Set(layout.rotated);
  return {
    tables: tables
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((t) => draftFromApi(t, normalizeZone(t.zone), rotated)),
    fixtures: layout.zones,
  };
}

/**
 * Floor & Hall Management Panel (Floor plan, QR codes)
 */
export function CabinetFloorPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const ui = copy.ui;
  const [tables, setTables] = useState<Table[]>([]);
  const [baseline, setBaseline] = useState<FloorPlanState>(EMPTY_PLAN);
  const plan = useUndoHistory<FloorPlanState>(EMPTY_PLAN);
  const resetPlan = plan.reset;
  const pushPlan = plan.push;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoHideNotice(notice, clearNotice);
  const dirty = useMemo(() => planSignature(plan.present) !== planSignature(baseline), [plan.present, baseline]);

  /** The layout is stored under the real venue id (an unpublished application has none yet). */
  const layoutKey = (list: Table[]) => list[0]?.venue_id || venueId;

  const reload = useCallback(
    async (restoreDraft = false) => {
      const qr = await listVenueQR(venueId);
      const next = planFromTables(qr, qr[0]?.venue_id || venueId);
      setTables(qr);
      setBaseline(next);
      resetPlan(next);
      const draft = restoreDraft ? readFloorDraft(venueId, next) : null;
      if (draft && planSignature(draft) !== planSignature(next)) {
        pushPlan(draft);
        return true;
      }
      return false;
    },
    [venueId, resetPlan, pushPlan],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload(true)
        .then((restored) => {
          if (restored && !cancelled) {
            setNotice({ kind: "success", text: getSiteCopy(locale).cabinet.floorEditor.draftRestored });
          }
        })
        .catch(() => {
          if (!cancelled) setNotice({ kind: "error", text: getSiteCopy(locale).cabinet.ui.floorLoadFailed });
        })
        .finally(() => {
          if (!cancelled) {
            setBusy(false);
            setLoaded(true);
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  useEffect(() => {
    if (loaded) writeFloorDraft(venueId, baseline, dirty ? plan.present : null);
  }, [loaded, venueId, baseline, dirty, plan.present]);

  // Closing the tab or reloading with an unsaved plan asks first (the browser shows its own text).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function run(action: () => Promise<string | void>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      const warning = await action();
      await reload();
      setNotice(warning ? { kind: "error", text: warning } : { kind: "success", text: ok });
    } catch {
      setNotice({ kind: "error", text: ui.opFailed });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const state = plan.present;
    setSaving(true);
    try {
      await run(async () => {
        await replaceVenueTables(venueId, state.tables.map(draftToApi));
        // Bar, kitchen, entrance and rotation are not part of the tables API yet (BACKEND_TASKS №28).
        if (!writeFloorLayout(layoutKey(tables), layoutOf(state))) return copy.floorEditor.layoutSaveFailed;
      }, ui.floorSaved);
    } finally {
      setSaving(false);
    }
  }

  const status = saving ? "saving" : dirty ? "unsaved" : "saved";
  const statusText =
    status === "saving" ? copy.floorEditor.statusSaving : status === "unsaved" ? copy.floorEditor.statusUnsaved : copy.floorEditor.statusSaved;

  return (
    <div className="cabinet-ops">
      <OpsNotice notice={notice} onClose={clearNotice} closeLabel={ui.close} />

      {/* Floor Plan Section */}
      <section className="owner-card cabinet-ops-card" aria-busy={busy}>
        <div className="owner-card-head cabinet-ops-floor-head">
          <div>
            <h3>{copy.opsFloorPlan}</h3>
            <p className="cabinet-ops-sub">{copy.opsFloorPlanHint}</p>
          </div>
          <div className="cabinet-ops-floor-actions">
            {loaded && (
              <span className={`floor-save-status ${status}`} role="status" aria-live="polite">
                <i aria-hidden="true" />
                {statusText}
              </span>
            )}
            <button
              type="button"
              className="panel-btn ghost"
              disabled={busy || !dirty}
              onClick={() => {
                // Undoable: the discarded edits come back with Undo.
                plan.push(baseline);
                setNotice({ kind: "success", text: ui.changesReset });
              }}
            >
              {copy.opsFloorPlanReset}
            </button>
            <button
              type="button"
              className="panel-btn"
              disabled={busy || !dirty || plan.present.tables.length === 0}
              onClick={() => void save()}
            >
              {copy.opsFloorPlanSave}
            </button>
          </div>
        </div>
        {!loaded ? (
          <div className="cabinet-ops-loading" role="status">
            <span className="owner-inline-spinner" aria-hidden="true" />
            <p>{ui.loading}</p>
          </div>
        ) : (
          <FloorPlanEditor
            value={plan.present}
            busy={busy}
            onChange={plan.push}
            canUndo={plan.canUndo}
            canRedo={plan.canRedo}
            onUndo={plan.undo}
            onRedo={plan.redo}
          />
        )}

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
                className="panel-btn ghost danger"
                disabled={busy}
                onClick={() => setConfirmRegen(true)}
              >
                {copy.opsQrRegen}
              </button>
            </div>
          </details>
        )}
      </section>

      <CabinetConfirmDialog
        open={confirmRegen}
        tone="warning"
        title={ui.qrRegenConfirmTitle}
        text={ui.qrRegenConfirmText}
        confirmLabel={ui.qrRegenConfirmBtn}
        cancelLabel={copy.opsMenuCancel}
        busy={busy}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => {
          setConfirmRegen(false);
          void run(async () => {
            await regenerateVenueQR(venueId);
          }, ui.qrRegenerated);
        }}
      />
    </div>
  );
}

/**
 * Booking Rules Management Panel
 */
export function CabinetRulesPanel({
  venueId,
  published,
  hoursText,
}: Props & { published?: boolean; hoursText?: string }) {
  return (
    <div className="cabinet-ops">
      <BookingRulesForm key={venueId} venueId={venueId} published={published} hoursText={hoursText} />
    </div>
  );
}

/**
 * Menu & Stop-List Management Panel
 */
export function CabinetMenuPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const ui = copy.ui;
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState<MenuForm>(() => emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingDish, setDeletingDish] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoHideNotice(notice, clearNotice);

  const modalRef = useRef<HTMLElement>(null);

  useDialogFocus(isModalOpen, modalRef, () => setIsModalOpen(false));

  useEffect(() => {
    if (!isModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isModalOpen]);

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
          if (!cancelled) setNotice({ kind: "error", text: getSiteCopy(locale).cabinet.ui.menuLoadFailed });
        })
        .finally(() => {
          if (!cancelled) {
            setBusy(false);
            setLoaded(true);
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function run(action: () => Promise<void>, ok: string, failed: string = ui.menuSaveFailed): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice({ kind: "success", text: ok });
      return true;
    } catch {
      setNotice({ kind: "error", text: failed });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const dishName = (item: MenuItem) => pickLocale(item.name, locale) || item.name.ru || item.name.en || "";
  const dishDescription = (item: MenuItem) =>
    pickLocale(item.description, locale) || item.description.ru || item.description.en || "";

  /** Categories in the order the venue's menu lists them. */
  const categories = useMemo(() => {
    const keys: string[] = [];
    const labels = new Map<string, string>();
    for (const item of menu) {
      const key = categoryKey(item);
      if (!key) continue;
      if (!labels.has(key)) {
        labels.set(key, pickLocale(item.category, locale) || CATEGORY_NAMES[key]?.[locale] || key);
        keys.push(key);
      }
    }
    return keys.map((key) => ({ key, label: labels.get(key) ?? key }));
  }, [menu, locale]);

  const categoryOptions = useMemo(() => {
    const options = CATEGORIES.map((key) => ({ key, label: CATEGORY_NAMES[key]?.[locale] || key }));
    for (const category of categories) {
      if (!CATEGORIES.includes(category.key)) options.push(category);
    }
    return options;
  }, [categories, locale]);

  function editItem(item: MenuItem) {
    const tags = item.tags ?? [];
    const allergens = item.allergens ?? [];
    setFormError(null);
    setForm({
      id: item.id,
      name: dishName(item),
      category: categoryKey(item) || "Основное",
      description: dishDescription(item),
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
    setFormError(null);
    setForm(emptyForm(selectedCategory !== "all" ? selectedCategory : "Основное"));
    setIsModalOpen(true);
  }

  async function saveDish() {
    const name = form.name.trim();
    if (!name) return;
    if (!(Number(form.price) > 0)) {
      setFormError(ui.priceRequired);
      document.getElementById("edit-dish-price")?.focus();
      return;
    }
    setFormError(null);
    const original = form.id ? menu.find((item) => item.id === form.id) : undefined;
    const categorySample = menu.find((item) => categoryKey(item) === form.category);
    const tags: string[] = [];
    if (form.isPopular) tags.push("popular");
    if (form.isVeg) tags.push("vegetarian");
    if (form.isSpicy) tags.push("spicy");

    const allergens = form.allergens
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload: Partial<MenuItem> & { name: { ru: string; en: string; ro: string }; price: number } = {
      name: original ? mergeLocalized(original.name, locale, name) : emptyLocalized(name),
      category: categorySample
        ? { ru: categorySample.category.ru, en: categorySample.category.en, ro: categorySample.category.ro }
        : CATEGORY_NAMES[form.category] ?? emptyLocalized(form.category.trim() || "Основное"),
      description: original
        ? mergeLocalized(original.description, locale, form.description.trim())
        : emptyLocalized(form.description.trim()),
      price: Number(form.price) || 0,
      contains_alcohol: form.alcohol,
      image_url: form.image_url.trim() || undefined,
      weight_g: form.weight_g ? Number(form.weight_g) : undefined,
      tags,
      allergens: allergens.length > 0 ? allergens : undefined,
    };

    // On failure the popup stays open so nothing typed is lost.
    const ok = await run(async () => {
      if (form.id) {
        await updateOwnerMenuItem(venueId, form.id, payload);
      } else {
        await upsertOwnerMenuItem(venueId, payload);
      }
    }, form.id ? ui.dishUpdated : ui.dishAdded);
    if (ok) {
      setIsModalOpen(false);
      setForm(emptyForm());
    } else {
      setFormError(ui.menuSaveFailed);
    }
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
    }, ui.dishRemoved, ui.opFailed);
    setDeletingDish(null);
  }

  const filteredDishes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const haystack = (value: Partial<Localized>) =>
      [value.ru, value.en, value.ro].filter(Boolean).join(" ").toLowerCase();
    return menu.filter((item) => {
      const matchCat = selectedCategory === "all" || categoryKey(item) === selectedCategory;
      const matchQuery =
        !query || haystack(item.name).includes(query) || haystack(item.description).includes(query);
      return matchCat && matchQuery;
    });
  }, [menu, selectedCategory, searchQuery]);

  // Cheap to compute; plain function keeps the React Compiler happy.
  const grouped = (() => {
    const groups = categories
      .map((category) => ({
        cat: category.key,
        label: category.label,
        items: filteredDishes.filter((m) => categoryKey(m) === category.key),
      }))
      .filter((g) => g.items.length > 0);
    const uncategorized = filteredDishes.filter((m) => !categoryKey(m));
    return uncategorized.length
      ? [...groups, { cat: "other", label: ui.other, items: uncategorized }]
      : groups;
  })();

  return (
    <div className="cabinet-ops">
      <OpsNotice notice={notice} onClose={clearNotice} closeLabel={ui.close} />

      {/* Menu Catalog & Stop List */}
      <section className="owner-card cabinet-ops-card" aria-busy={busy}>
        <div className="owner-card-head cabinet-menu-head">
          <div>
            <h3>{copy.menuSectionTitle} ({menu.length})</h3>
            <p className="cabinet-ops-sub">{copy.menuSectionSubtitle}</p>
          </div>
          <div className="cabinet-menu-head-actions">
            <input
              type="search"
              aria-label={ui.searchDish}
              placeholder={ui.searchDish}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cabinet-search-input"
            />
            <button
              type="button"
              className="panel-btn primary cabinet-add-dish-btn"
              onClick={openAddDish}
            >
              + {copy.opsMenuAddDish}
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        {menu.length > 0 && (
          <div className="cabinet-category-pills" role="group" aria-label={ui.menuCategories}>
            <button
              type="button"
              className={selectedCategory === "all" ? "active" : ""}
              aria-pressed={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
            >
              {ui.all} ({menu.length})
            </button>
            {categories.map((category) => {
              const count = menu.filter((m) => categoryKey(m) === category.key).length;
              return (
                <button
                  key={category.key}
                  type="button"
                  className={selectedCategory === category.key ? "active" : ""}
                  aria-pressed={selectedCategory === category.key}
                  onClick={() => setSelectedCategory(category.key)}
                >
                  {category.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {!loaded ? (
          <div className="cabinet-ops-loading" role="status">
            <span className="owner-inline-spinner" aria-hidden="true" />
            <p>{ui.loading}</p>
          </div>
        ) : menu.length === 0 ? (
          <div className="cabinet-ops-empty cabinet-menu-empty">
            <p>{copy.opsMenuEmpty}</p>
            <button
              type="button"
              className="panel-btn primary cabinet-add-dish-btn"
              onClick={openAddDish}
            >
              + {copy.opsMenuAddDish}
            </button>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="cabinet-ops-empty cabinet-menu-empty">
            <p>{ui.noDishesFound}</p>
            <button
              type="button"
              className="panel-btn ghost"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
            >
              {ui.resetSearch}
            </button>
          </div>
        ) : (
          <div className="cabinet-menu-list">
            {grouped.map((group) => (
              <div key={group.cat} className="cabinet-menu-group">
                <h4>{group.label}</h4>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id} className={item.stopped ? "stopped" : ""}>
                      <div className="cabinet-dish-info">
                        <div className="cabinet-dish-title-row">
                          <strong>{dishName(item)}</strong>
                          <span className="cabinet-dish-price">{item.price} MDL</span>
                        </div>
                        {(item.contains_alcohol || item.stopped) && (
                          <div className="cabinet-dish-badges">
                            {item.contains_alcohol && <span className="cabinet-dish-adult-badge">18+</span>}
                            {item.stopped && <span className="cabinet-dish-stop-badge">{ui.stoppedBadge}</span>}
                          </div>
                        )}
                        {dishDescription(item) ? <p>{dishDescription(item)}</p> : null}
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
                          disabled={busy}
                          aria-pressed={!!item.stopped}
                          onClick={() =>
                            void run(
                              async () => {
                                await stopOwnerMenuItem(venueId, item.id, !item.stopped);
                              },
                              (item.stopped ? ui.stopListOff : ui.stopListOn).replace("{name}", dishName(item)),
                              ui.opFailed,
                            )
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
                        <SelectMenu
                          id="edit-dish-cat"
                          value={form.category}
                          onChange={(value) => setForm((f) => ({ ...f, category: value }))}
                          options={categoryOptions.map((option) => ({
                            value: option.key,
                            label: option.label,
                          }))}
                        />
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

                  {formError && (
                    <p className="cabinet-dish-form-error" role="alert">
                      {formError}
                    </p>
                  )}
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
                        onChange={(e) => {
                          setFormError(null);
                          setForm((f) => ({ ...f, price: e.target.value }));
                        }}
                        placeholder="0"
                        aria-invalid={formError === ui.priceRequired ? true : undefined}
                      />
                      <span className="cabinet-dish-currency">MDL</span>
                    </div>

                    <button
                      type="submit"
                      className="cabinet-dish-save-cta"
                      disabled={busy || !form.name.trim()}
                    >
                      {form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}
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

      <CabinetConfirmDialog
        open={!!deletingDish}
        title={copy.opsMenuDeleteConfirmTitle}
        text={copy.opsMenuDeleteConfirmText.replace("{name}", deletingDish ? dishName(deletingDish) : "")}
        confirmLabel={copy.opsMenuDeleteConfirmBtn}
        cancelLabel={copy.opsMenuCancel}
        busy={busy}
        onConfirm={() => void handleDeleteDish()}
        onCancel={() => setDeletingDish(null)}
      />
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
