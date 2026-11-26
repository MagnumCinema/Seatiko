"use client";

import "@/app/cabinet/menu.css";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import {
  CabinetDishEditor,
  CloseIcon,
  CopyIcon,
  ImageIcon,
  PencilIcon,
  Switch,
  TrashIcon,
  starterCategories,
} from "@/components/cabinet-menu-editor";
import { useLocale } from "@/components/locale-provider";
import { allergenLabel } from "@/components/menu-dish-popup";
import { SelectMenu } from "@/components/ui/select-menu";
import { FlameIcon, LeafIcon, MenuBookIcon, SearchIcon } from "@/components/venue-icons";
import {
  deleteOwnerMenuItem,
  listOwnerMenu,
  mediaUrl,
  stopOwnerMenuItem,
  updateOwnerMenuItem,
  upsertOwnerMenuItem,
  type LocaleCode,
  type LocalizedString,
  type MenuItem,
} from "@/lib/api";
import { pluralize } from "@/lib/cabinet-helpers";
import {
  NEW_CATEGORY,
  categoryKeyOf,
  draftFromItem,
  duplicateDraft,
  emptyDraft,
  filterDishes,
  findCategoryByName,
  formatPrice,
  groupByCategory,
  isFiltered,
  itemToPayload,
  menuCategories,
  menuStats,
  missingLocales,
  runBatch,
  textIn,
  trimText,
  finalizeText,
  emptyText,
  isBlankText,
  type DishDraft,
  type MenuCategoryInfo,
  type MenuFilterState,
  type MenuItemPayload,
  type MenuStatusFilter,
} from "@/lib/cabinet-menu";
import { portionOf } from "@/lib/menu";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";

type Copy = ReturnType<typeof getSiteCopy>["cabinet"];
type MenuCopy = Copy["menuEditor"];
type Translate = ReturnType<typeof useLocale>["t"];
type Notice = { kind: "success" | "error"; text: string };
type EditorState = { id: number; mode: "new" | "edit"; itemId?: string; initial: DishDraft };
type ConfirmState =
  | { kind: "dish"; item: MenuItem }
  | { kind: "dishes"; ids: string[] }
  | { kind: "category"; category: MenuCategoryInfo };
type RowAction = "open" | "edit" | "duplicate" | "delete" | "toggle" | "select";

const LANG_CODE: Record<LocaleCode, string> = { ru: "RU", en: "EN", ro: "RO" };
const NO_FILTERS: MenuFilterState = { query: "", status: "all", category: "all" };

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

/** Owner cabinet → «Меню». A venue that is not published yet has no menu on the server. */
export function CabinetMenuPanel({ venueId }: { venueId: string }) {
  const { locale } = useLocale();
  const m = getSiteCopy(locale).cabinet.menuEditor;
  if (!venueId) {
    return (
      <section className="cm-panel">
        <div className="owner-section-empty">
          <span aria-hidden="true">
            <MenuBookIcon />
          </span>
          <h3>{m.lockedTitle}</h3>
          <p>{m.lockedHint}</p>
        </div>
      </section>
    );
  }
  return <MenuWorkspace key={venueId} venueId={venueId} />;
}

function MenuWorkspace({ venueId }: { venueId: string }) {
  const { locale, t } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const m = copy.menuEditor;
  const ui = copy.ui;

  const [items, setItems] = useState<MenuItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filters, setFilters] = useState<MenuFilterState>(NO_FILTERS);
  const query = useDeferredValue(filters.query);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [renaming, setRenaming] = useState<MenuCategoryInfo | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const editorSeq = useRef(0);

  const dishes = useCallback((count: number) => fill(pluralize(count, m.dishForms, locale), { n: count }), [m.dishForms, locale]);
  const nameOf = useCallback((item: MenuItem) => textIn(item.name, locale), [locale]);

  useEffect(() => {
    let alive = true;
    listOwnerMenu(venueId)
      .then((list) => {
        if (!alive) return;
        setItems(list);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [venueId]);

  // Success notices fade on their own; errors stay until closed.
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function retry() {
    setStatus("loading");
    try {
      setItems(await listOwnerMenu(venueId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  /** Reloads the menu (server order after creates); keeps the current list when offline. */
  async function refresh() {
    try {
      setItems(await listOwnerMenu(venueId));
    } catch {
      /* keep what we have */
    }
  }

  const categories = useMemo(() => menuCategories(items), [items]);
  const stats = useMemo(() => menuStats(items), [items]);
  const categoryFilter = categories.some((c) => c.key === filters.category) ? filters.category : "all";
  const visible = useMemo(
    () => filterDishes(items, { query, status: filters.status, category: categoryFilter }),
    [items, query, filters.status, categoryFilter],
  );
  const groups = useMemo(() => groupByCategory(visible, categories), [visible, categories]);
  const filtering = isFiltered({ query: filters.query, status: filters.status, category: categoryFilter });
  const selecting = selected !== null;

  // ---------- Dish actions ----------

  function openEditor(mode: "new" | "edit", initial: DishDraft, itemId?: string) {
    editorSeq.current += 1;
    setEditor({ id: editorSeq.current, mode, initial, itemId });
  }

  function openNew(categoryKey?: string, newCategory?: LocalizedString) {
    const key =
      newCategory !== undefined
        ? NEW_CATEGORY
        : (categoryKey ?? (categoryFilter !== "all" ? categoryFilter : categories[0]?.key)) || NEW_CATEGORY;
    openEditor("new", emptyDraft(key, newCategory ?? emptyText()));
  }

  function duplicate(item: MenuItem) {
    const suffix = {
      ru: getSiteCopy("ru").cabinet.menuEditor.duplicateSuffix,
      en: getSiteCopy("en").cabinet.menuEditor.duplicateSuffix,
      ro: getSiteCopy("ro").cabinet.menuEditor.duplicateSuffix,
    };
    openEditor("new", duplicateDraft(item, suffix));
  }

  async function toggleStop(item: MenuItem) {
    const stopped = !item.stopped;
    setPending((current) => new Set(current).add(item.id));
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, stopped } : i)));
    try {
      const saved = await stopOwnerMenuItem(venueId, item.id, stopped);
      setItems((list) => list.map((i) => (i.id === item.id ? (saved?.id ? saved : { ...i, stopped }) : i)));
      setNotice({ kind: "success", text: (stopped ? ui.stopListOn : ui.stopListOff).replace("{name}", nameOf(item)) });
    } catch {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, stopped: item.stopped } : i)));
      setNotice({ kind: "error", text: ui.opFailed });
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function saveDish(payload: MenuItemPayload, itemId?: string, next = false): Promise<boolean> {
    try {
      const saved = itemId
        ? await updateOwnerMenuItem(venueId, itemId, payload)
        : await upsertOwnerMenuItem(venueId, payload);
      if (saved?.id) {
        setItems((list) => (itemId ? list.map((i) => (i.id === itemId ? saved : i)) : [...list, saved]));
      }
      const name = textIn(payload.name, locale);
      // «Save & new»: a fresh form in the same category, for typing in a whole menu.
      if (next) openEditor("new", emptyDraft(categoryKeyOf(payload.category)));
      else setEditor(null);
      setNotice({
        kind: "success",
        text: (itemId ? m.saved : payload.stopped ? m.addedStopped : m.added).replace("{name}", name),
      });
      void refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function deleteDish(item: MenuItem) {
    setBusy(true);
    try {
      await deleteOwnerMenuItem(venueId, item.id);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setSelected((current) => {
        if (!current?.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      if (editor?.itemId === item.id) setEditor(null);
      setNotice({ kind: "success", text: m.deleted.replace("{name}", nameOf(item)) });
    } catch {
      setNotice({ kind: "error", text: ui.opFailed });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  // Rows get one stable callback; it reads the latest handlers.
  const rowHandler = useRef<(action: RowAction, item: MenuItem) => void>(() => undefined);
  useEffect(() => {
    rowHandler.current = (action, item) => {
      if (action === "toggle") void toggleStop(item);
      else if (action === "duplicate") duplicate(item);
      else if (action === "delete") setConfirm({ kind: "dish", item });
      else if (action === "select" || (action === "open" && selecting)) {
        setSelected((current) => {
          const next = new Set(current ?? []);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else openEditor("edit", draftFromItem(item), item.id);
    };
  });
  const onRowAction = useCallback((action: RowAction, item: MenuItem) => rowHandler.current(action, item), []);

  // ---------- Bulk and category actions ----------

  async function runBulk(
    targets: MenuItem[],
    task: (item: MenuItem) => Promise<unknown>,
    success: string,
  ): Promise<MenuItem[]> {
    if (targets.length === 0) return [];
    setBusy(true);
    setNotice(null);
    const { failed } = await runBatch(targets, task);
    await refresh();
    setBusy(false);
    setNotice(
      failed.length > 0
        ? { kind: "error", text: fill(m.bulkPartial, { failed: failed.length, total: targets.length }) }
        : { kind: "success", text: success },
    );
    return failed;
  }

  const selectedItems = useMemo(() => items.filter((item) => selected?.has(item.id)), [items, selected]);

  // Stop / resume / move keep the selection, so the owner can do the next step with the same dishes.
  async function bulkStop(stopped: boolean) {
    const targets = selectedItems.filter((item) => !!item.stopped !== stopped);
    await runBulk(
      targets,
      (item) => stopOwnerMenuItem(venueId, item.id, stopped),
      fill(stopped ? m.bulkStopped : m.bulkResumed, { dishes: dishes(targets.length) }),
    );
  }

  async function bulkMove(categoryKey: string) {
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) return;
    const targets = selectedItems.filter((item) => categoryKeyOf(item.category) !== category.key);
    await runBulk(
      targets,
      (item) => updateOwnerMenuItem(venueId, item.id, itemToPayload(item, { category: { ...category.names } })),
      fill(m.bulkMoved, { category: textIn(category.names, locale), dishes: dishes(targets.length) }),
    );
  }

  async function confirmDelete() {
    if (!confirm) return;
    if (confirm.kind === "dish") {
      await deleteDish(confirm.item);
      return;
    }
    const targets =
      confirm.kind === "dishes"
        ? items.filter((item) => confirm.ids.includes(item.id))
        : items.filter((item) => categoryKeyOf(item.category) === confirm.category.key);
    const success =
      confirm.kind === "dishes"
        ? fill(m.bulkDeleted, { dishes: dishes(targets.length) })
        : m.categoryDeleted.replace("{name}", textIn(confirm.category.names, locale));
    const failed = await runBulk(targets, (item) => deleteOwnerMenuItem(venueId, item.id), success);
    if (confirm.kind === "dishes") setSelected(new Set(failed.map((item) => item.id)));
    setConfirm(null);
  }

  async function renameCategory(category: MenuCategoryInfo, names: LocalizedString): Promise<boolean> {
    const targets = items.filter((item) => categoryKeyOf(item.category) === category.key);
    const failed = await runBulk(
      targets,
      (item) => updateOwnerMenuItem(venueId, item.id, itemToPayload(item, { category: names })),
      m.categoryRenamed.replace("{name}", textIn(names, locale)),
    );
    if (failed.length === 0) {
      if (categoryFilter === category.key) setFilters((f) => ({ ...f, category: categoryKeyOf(names) }));
      setRenaming(null);
      return true;
    }
    return false;
  }

  // ---------- Render ----------

  if (status === "loading") {
    return (
      <section className="cm-panel">
        <div className="owner-section-empty" role="status">
          <span className="owner-inline-spinner" aria-hidden="true" />
          <p>{ui.loading}</p>
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="cm-panel">
        <div className="owner-section-empty" role="alert">
          <span aria-hidden="true">
            <MenuBookIcon />
          </span>
          <h3>{m.loadFailedTitle}</h3>
          <p>{m.loadFailedHint}</p>
          <button type="button" className="panel-btn primary cm-btn cm-empty-cta" onClick={() => void retry()}>
            {m.retry}
          </button>
        </div>
      </section>
    );
  }

  const editingItem = editor?.itemId ? items.find((item) => item.id === editor.itemId) : undefined;
  const statTiles: { status: MenuStatusFilter; label: string; value: number; hint: string; tone?: string }[] = [
    { status: "available", label: m.statOnMenu, value: stats.available, hint: fill(m.statOnMenuHint, { total: stats.total }) },
    { status: "stopped", label: m.statStopped, value: stats.stopped, hint: m.statStoppedHint, tone: "warn" },
    { status: "noPhoto", label: m.statNoPhoto, value: stats.noPhoto, hint: m.statNoPhotoHint },
    { status: "untranslated", label: m.statUntranslated, value: stats.untranslated, hint: m.statUntranslatedHint },
  ];
  const allShownSelected = selected !== null && visible.length > 0 && visible.every((item) => selected.has(item.id));

  return (
    <section className="cm-panel" aria-busy={busy}>
      <MenuNotice notice={notice} onClose={() => setNotice(null)} closeLabel={m.close} />

      {items.length === 0 ? (
        <div className="owner-section-empty cm-empty">
          <span aria-hidden="true">
            <MenuBookIcon />
          </span>
          <h3>{m.emptyTitle}</h3>
          <p>{m.emptyHint}</p>
          <button type="button" className="panel-btn primary cm-btn cm-empty-cta" onClick={() => openNew()}>
            <PlusIcon />
            {m.addDish}
          </button>
          <div className="cm-suggest is-center">
            <span>{m.emptyStart}</span>
            {starterCategories().map((names) => (
              <button key={names.ru} type="button" className="cm-chip" onClick={() => openNew(undefined, names)}>
                {names[locale]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="cm-stats" role="group" aria-label={m.statsLabel}>
            {statTiles.map((tile) => {
              const active = filters.status === tile.status;
              return (
                <button
                  key={tile.status}
                  type="button"
                  className={`cm-stat${active ? " active" : ""}${tile.tone && tile.value > 0 ? ` is-${tile.tone}` : ""}`}
                  aria-pressed={active}
                  onClick={() => setFilters((f) => ({ ...f, status: f.status === tile.status ? "all" : tile.status }))}
                >
                  <span>{tile.label}</span>
                  <strong>{tile.value}</strong>
                  <small>{tile.hint}</small>
                </button>
              );
            })}
          </div>

          <div className="cm-toolbar">
            <label className="cm-search">
              <SearchIcon />
              <input
                type="search"
                aria-label={m.searchLabel}
                placeholder={m.searchPlaceholder}
                value={filters.query}
                onChange={(event) => setFilters((f) => ({ ...f, query: event.target.value }))}
              />
              {filters.query ? (
                <button type="button" aria-label={m.clearSearch} onClick={() => setFilters((f) => ({ ...f, query: "" }))}>
                  <CloseIcon />
                </button>
              ) : null}
            </label>
            <div className="cm-toolbar-actions">
              <a
                className="panel-btn ghost cm-btn"
                href={`/venues/${encodeURIComponent(venueId)}/menu`}
                target="_blank"
                rel="noopener noreferrer"
                title={m.guestMenuHint}
              >
                <ExternalIcon />
                {m.guestMenu}
              </a>
              <button
                type="button"
                className={`panel-btn ghost cm-btn${selecting ? " is-on" : ""}`}
                aria-pressed={selecting}
                onClick={() => setSelected(selecting ? null : new Set())}
              >
                <CheckSquareIcon />
                {m.select}
              </button>
              <button type="button" className="panel-btn primary cm-btn" onClick={() => openNew()}>
                <PlusIcon />
                {m.addDish}
              </button>
            </div>
          </div>

          <div className="cm-cats" role="group" aria-label={m.categoriesLabel}>
            <button
              type="button"
              className={categoryFilter === "all" ? "active" : ""}
              aria-pressed={categoryFilter === "all"}
              onClick={() => setFilters((f) => ({ ...f, category: "all" }))}
            >
              {m.allCategories}
              <b>{stats.total}</b>
            </button>
            {categories.map((category) => (
              <button
                key={category.key}
                type="button"
                className={categoryFilter === category.key ? "active" : ""}
                aria-pressed={categoryFilter === category.key}
                onClick={() => setFilters((f) => ({ ...f, category: f.category === category.key ? "all" : category.key }))}
              >
                {textIn(category.names, locale) || ui.other}
                <b>{category.total}</b>
              </button>
            ))}
          </div>

          {filtering ? (
            <div className="cm-found" aria-live="polite">
              <span>{fill(m.found, { dishes: dishes(visible.length) })}</span>
              <button type="button" className="cm-link-btn" onClick={() => setFilters(NO_FILTERS)}>
                {m.resetFilters}
              </button>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="owner-section-empty cm-empty">
              <span aria-hidden="true">
                <SearchIcon />
              </span>
              <h3>{m.noResultsTitle}</h3>
              <p>{m.noResultsHint}</p>
              <button type="button" className="panel-btn ghost cm-btn cm-empty-cta" onClick={() => setFilters(NO_FILTERS)}>
                {m.resetFilters}
              </button>
            </div>
          ) : (
            <div className="cm-groups">
              {groups.map(({ category, items: groupItems }) => {
                const label = textIn(category.names, locale) || ui.other;
                return (
                  <section key={category.key} className="cm-group" aria-label={label}>
                    <header className="cm-group-head">
                      <h3>
                        <strong>{label}</strong>
                        <span>{dishes(groupItems.length)}</span>
                        {category.stopped > 0 ? (
                          <small className="cm-pill is-stopped">{fill(m.stoppedInCategory, { n: category.stopped })}</small>
                        ) : null}
                      </h3>
                      <div className="cm-group-actions">
                        <button
                          type="button"
                          className="cm-icon-btn"
                          aria-label={m.addToCategory.replace("{name}", label)}
                          title={m.addToCategory.replace("{name}", label)}
                          onClick={() => openNew(category.key)}
                        >
                          <PlusIcon />
                        </button>
                        <button
                          type="button"
                          className="cm-icon-btn"
                          aria-label={m.renameCategoryLabel.replace("{name}", label)}
                          title={m.renameCategoryLabel.replace("{name}", label)}
                          disabled={busy}
                          onClick={() => setRenaming(category)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="cm-icon-btn is-danger"
                          aria-label={m.deleteCategoryLabel.replace("{name}", label)}
                          title={m.deleteCategoryLabel.replace("{name}", label)}
                          disabled={busy}
                          onClick={() => setConfirm({ kind: "category", category })}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </header>
                    <ul className="cm-list">
                      {groupItems.map((item) => (
                        <DishRow
                          key={item.id}
                          item={item}
                          locale={locale}
                          t={t}
                          m={m}
                          stoppedBadge={ui.stoppedBadge}
                          selecting={selecting}
                          selected={!!selected?.has(item.id)}
                          pending={pending.has(item.id) || busy}
                          onAction={onRowAction}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {selected ? (
            <div className="cm-bulk" role="region" aria-label={m.bulkLabel}>
              <div className="cm-bulk-count">
                <strong>{fill(m.selectedCount, { n: selectedItems.length })}</strong>
                {allShownSelected ? (
                  <button type="button" className="cm-link-btn" onClick={() => setSelected(new Set())}>
                    {m.clearSelection}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cm-link-btn"
                    disabled={visible.length === 0}
                    onClick={() => setSelected(new Set([...selected, ...visible.map((item) => item.id)]))}
                  >
                    {fill(m.selectAllShown, { n: visible.length })}
                  </button>
                )}
              </div>
              <div className="cm-bulk-actions">
                <button
                  type="button"
                  className="panel-btn ghost cm-btn"
                  disabled={busy || !selectedItems.some((item) => !item.stopped)}
                  onClick={() => void bulkStop(true)}
                >
                  {m.bulkStop}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost cm-btn"
                  disabled={busy || !selectedItems.some((item) => item.stopped)}
                  onClick={() => void bulkStop(false)}
                >
                  {m.bulkResume}
                </button>
                <SelectMenu
                  value=""
                  placeholder={m.bulkMove}
                  ariaLabel={m.bulkMove}
                  disabled={busy || selectedItems.length === 0}
                  size="compact"
                  className="cm-bulk-move"
                  options={categories.map((category) => ({
                    value: category.key,
                    label: textIn(category.names, locale) || ui.other,
                  }))}
                  onChange={(value) => void bulkMove(value)}
                />
                <button
                  type="button"
                  className="panel-btn ghost danger cm-btn"
                  disabled={busy || selectedItems.length === 0}
                  onClick={() => setConfirm({ kind: "dishes", ids: selectedItems.map((item) => item.id) })}
                >
                  {m.bulkDelete}
                </button>
                <button type="button" className="panel-btn primary cm-btn" onClick={() => setSelected(null)}>
                  {m.bulkDone}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {editor ? (
        <CabinetDishEditor
          key={editor.id}
          mode={editor.mode}
          initial={editor.initial}
          item={editingItem}
          items={items}
          categories={categories}
          venueId={venueId}
          suspended={confirm !== null}
          onSave={(payload, next) => saveDish(payload, editor.itemId, next)}
          onClose={() => setEditor(null)}
          onDelete={editingItem ? () => setConfirm({ kind: "dish", item: editingItem }) : undefined}
          onDuplicate={editingItem ? () => duplicate(editingItem) : undefined}
        />
      ) : null}

      {renaming ? (
        <CategoryRenameDialog
          category={renaming}
          categories={categories}
          m={m}
          busy={busy}
          count={renaming.total}
          onCancel={() => setRenaming(null)}
          onSave={(names) => renameCategory(renaming, names)}
        />
      ) : null}

      <CabinetConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "dish"
            ? m.deleteDishTitle
            : confirm?.kind === "dishes"
              ? fill(m.deleteDishesTitle, { dishes: dishes(confirm.ids.length) })
              : confirm?.kind === "category"
                ? m.deleteCategoryTitle.replace("{name}", textIn(confirm.category.names, locale))
                : ""
        }
        text={
          confirm?.kind === "dish"
            ? m.deleteDishText.replace("{name}", nameOf(confirm.item))
            : confirm?.kind === "dishes"
              ? m.deleteDishesText
              : confirm?.kind === "category"
                ? fill(m.deleteCategoryText, { dishes: dishes(confirm.category.total) })
                : ""
        }
        confirmLabel={m.deleteConfirm}
        cancelLabel={m.cancel}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </section>
  );
}

const DishRow = memo(function DishRow({
  item,
  locale,
  t,
  m,
  stoppedBadge,
  selecting,
  selected,
  pending,
  onAction,
}: {
  item: MenuItem;
  locale: LocaleCode;
  t: Translate;
  m: MenuCopy;
  stoppedBadge: string;
  selecting: boolean;
  selected: boolean;
  pending: boolean;
  onAction: (action: RowAction, item: MenuItem) => void;
}) {
  const name = textIn(item.name, locale);
  const description = textIn(item.description, locale);
  const portion = portionOf(item);
  const missing = missingLocales(item);
  const allergens = item.allergens ?? [];
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const url = item.image_url?.trim() ?? "";
  const photo = url && brokenPhoto !== url ? mediaUrl(url) : "";
  const langs = missing.map((code) => LANG_CODE[code]).join(", ");

  function onRowClick(event: MouseEvent<HTMLLIElement>) {
    if ((event.target as HTMLElement).closest("button, a, input, label")) return;
    onAction("open", item);
  }

  return (
    <li
      className={`cm-row${item.stopped ? " is-stopped" : ""}${selecting ? " is-selecting" : ""}${selected ? " is-selected" : ""}`}
      onClick={onRowClick}
    >
      {selecting ? (
        <label className="cm-check">
          <input
            type="checkbox"
            checked={selected}
            aria-label={m.selectLabel.replace("{name}", name)}
            onChange={() => onAction("select", item)}
          />
          <span aria-hidden="true" />
        </label>
      ) : null}
      <span className={`cm-thumb${photo ? "" : " is-empty"}`} title={photo ? undefined : m.noPhoto}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote dish photos
          <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBrokenPhoto(url)} />
        ) : (
          <ImageIcon />
        )}
      </span>
      <div className="cm-row-main">
        <div className="cm-row-title">
          <button type="button" className="cm-row-name" onClick={() => onAction("open", item)}>
            {name}
          </button>
          {item.stopped ? <span className="cm-pill is-stopped">{stoppedBadge}</span> : null}
          {missing.length > 0 ? (
            <span className="cm-pill is-lang" title={m.noTranslationTitle.replace("{langs}", langs)}>
              {m.noTranslation.replace("{langs}", langs)}
            </span>
          ) : null}
        </div>
        {description ? <p className="cm-row-desc">{description}</p> : null}
        <div className="cm-row-meta">
          {portion ? (
            <span className="cm-row-portion">
              {t(portion.unit === "g" ? "menu_page.portion_g" : "menu_page.portion_ml", { amount: portion.amount })}
            </span>
          ) : null}
          {item.tags?.includes("popular") ? <span className="menu-tag popular">{t("menu_page.tag_popular")}</span> : null}
          {item.tags?.includes("vegetarian") ? (
            <span className="menu-tag veg">
              <LeafIcon className="menu-tag-icon" />
              {t("menu_page.tag_vegetarian")}
            </span>
          ) : null}
          {item.tags?.includes("spicy") ? (
            <span className="menu-tag spicy">
              <FlameIcon className="menu-tag-icon" />
              {t("menu_page.tag_spicy")}
            </span>
          ) : null}
          {item.contains_alcohol || item.requires_age_18 ? (
            <span className="menu-tag adult" title={t("menu_page.tag_alcohol_label")}>
              {t("menu_page.tag_alcohol")}
            </span>
          ) : null}
          {allergens.length > 0 ? (
            <span className="cm-row-allergens">
              {m.allergensShort.replace("{list}", allergens.map((code) => allergenLabel(t, code)).join(", "))}
            </span>
          ) : null}
        </div>
      </div>
      <span className="cm-row-price">{formatPrice(item.price, locale)}</span>
      <div className="cm-row-actions">
        <span className="cm-avail">
          <Switch
            checked={!item.stopped}
            label={m.availabilityLabel.replace("{name}", name)}
            disabled={pending || selecting}
            onChange={() => onAction("toggle", item)}
          />
          <span aria-hidden="true">{item.stopped ? m.offMenu : m.onMenu}</span>
        </span>
        <button
          type="button"
          className="cm-icon-btn"
          aria-label={m.editLabel.replace("{name}", name)}
          title={m.edit}
          disabled={selecting}
          onClick={() => onAction("edit", item)}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="cm-icon-btn"
          aria-label={m.duplicateLabel.replace("{name}", name)}
          title={m.duplicate}
          disabled={selecting}
          onClick={() => onAction("duplicate", item)}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="cm-icon-btn is-danger"
          aria-label={m.deleteLabel.replace("{name}", name)}
          title={m.deleteConfirm}
          disabled={selecting || pending}
          onClick={() => onAction("delete", item)}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
});

function CategoryRenameDialog({
  category,
  categories,
  m,
  busy,
  count,
  onCancel,
  onSave,
}: {
  category: MenuCategoryInfo;
  categories: MenuCategoryInfo[];
  m: MenuCopy;
  busy: boolean;
  count: number;
  onCancel: () => void;
  onSave: (names: LocalizedString) => Promise<boolean>;
}) {
  const ref = useRef<HTMLElement>(null);
  const [names, setNames] = useState<LocalizedString>(() => ({ ...category.names }));
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(true, ref, () => {
    if (!busy) onCancel();
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const typed = trimText(names);
    if (isBlankText(typed)) {
      setError(m.errCategory);
      return;
    }
    const clash = findCategoryByName(
      categories.filter((c) => c.key !== category.key),
      typed,
    );
    // Same name as another category: the dishes join it (its names win).
    const finalNames = clash ? { ...clash.names } : finalizeText(category.names, typed);
    const ok = await onSave(finalNames);
    if (!ok) setError(m.saveFailed);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" tabIndex={-1} aria-label={m.cancel} onClick={() => !busy && onCancel()} />
      <section ref={ref} className="booking-popup cm-rename" role="dialog" aria-modal="true" aria-labelledby="cm-rename-title">
        <form className="booking-popup-card cm-rename-card" onSubmit={(event) => void submit(event)}>
          <h3 id="cm-rename-title">{m.renameTitle}</h3>
          <p className="cm-hint">{fill(m.renameHint, { n: count })}</p>
          <div className="cm-newcat-inputs">
            {(["ru", "en", "ro"] as const).map((code, index) => (
              <label key={code} className="cm-inline-field">
                <span>{LANG_CODE[code]}</span>
                <input
                  className="cm-input"
                  value={names[code]}
                  maxLength={60}
                  autoComplete="off"
                  data-autofocus={index === 0 ? true : undefined}
                  onChange={(event) => {
                    setError(null);
                    setNames((current) => ({ ...current, [code]: event.target.value }));
                  }}
                />
              </label>
            ))}
          </div>
          {error ? (
            <p className="cm-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="cm-rename-actions">
            <button type="button" className="panel-btn ghost cm-btn" disabled={busy} onClick={onCancel}>
              {m.cancel}
            </button>
            <button type="submit" className="panel-btn primary cm-btn" disabled={busy}>
              {busy ? m.saving : m.save}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function MenuNotice({ notice, onClose, closeLabel }: { notice: Notice | null; onClose: () => void; closeLabel: string }) {
  if (!notice) return null;
  return (
    <div className={`owner-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live="polite">
      <span>{notice.kind === "error" ? "!" : "✓"}</span>
      <p>{notice.text}</p>
      <button type="button" aria-label={closeLabel} onClick={onClose}>
        ×
      </button>
    </div>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}
