"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { LocaleScope, useLocale } from "@/components/locale-provider";
import { MenuDishDetails, allergenLabel } from "@/components/menu-dish-popup";
import { SelectMenu } from "@/components/ui/select-menu";
import { MenuDish } from "@/components/venue-menu-board";
import { FlameIcon, LeafIcon } from "@/components/venue-icons";
import { mediaUrl, type LocaleCode, type LocalizedString, type MenuItem } from "@/lib/api";
import {
  ALLERGEN_CODES,
  MENU_LOCALES,
  NEW_CATEGORY,
  draftToPayload,
  draftsEqual,
  findCategoryByName,
  findSameName,
  isBlankText,
  needsTranslation,
  previewItem,
  textIn,
  toggleAllergen,
  toggleTag,
  validateDraft,
  type DishDraft,
  type DraftErrors,
  type MenuCategoryInfo,
  type MenuItemPayload,
} from "@/lib/cabinet-menu";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";

type Props = {
  mode: "new" | "edit";
  initial: DishDraft;
  /** The dish being edited (edit mode). */
  item?: MenuItem;
  items: MenuItem[];
  categories: MenuCategoryInfo[];
  venueId: string;
  /** Another dialog is open on top (delete confirmation): the editor lets it keep focus. */
  suspended?: boolean;
  onSave: (payload: MenuItemPayload) => Promise<boolean>;
  onClose: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
};

type TextField = "name" | "description" | "ingredients";

const LANG_CODE: Record<LocaleCode, string> = { ru: "RU", en: "EN", ro: "RO" };

function capitalize(text: string, locale: LocaleCode): string {
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

/** Starter category names in all three languages, from each language's copy. */
export function starterCategories(): LocalizedString[] {
  const ru = getSiteCopy("ru").cabinet.menuEditor.starterCategories;
  const en = getSiteCopy("en").cabinet.menuEditor.starterCategories;
  const ro = getSiteCopy("ro").cabinet.menuEditor.starterCategories;
  return ru.map((name, index) => ({ ru: name, en: en[index] ?? name, ro: ro[index] ?? name }));
}

export function CabinetDishEditor({
  mode,
  initial,
  item,
  items,
  categories,
  venueId,
  suspended = false,
  onSave,
  onClose,
  onDelete,
  onDuplicate,
}: Props) {
  const { locale, t } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const m = copy.menuEditor;
  const ui = copy.ui;
  const uid = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<DishDraft>(initial);
  const [lang, setLang] = useState<LocaleCode>(locale);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** What to do once the owner agrees to drop unsaved changes. */
  const [discardThen, setDiscardThen] = useState<null | "close" | "duplicate">(null);
  const discardOpen = discardThen !== null;
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [previewView, setPreviewView] = useState<"list" | "card">("list");

  const dirty = !draftsEqual(draft, initial);
  const errors: DraftErrors = validateDraft(draft);
  const visibleErrors: DraftErrors = showErrors ? errors : {};
  const imageUrl = draft.imageUrl.trim();
  const photoBroken = imageUrl !== "" && brokenUrl === imageUrl && !errors.imageUrl;
  const sameName = findSameName(items, draft.name, item?.id);
  const fieldId = (name: string) => `${uid}-${name}`;

  function requestClose() {
    if (saving || discardOpen) return;
    if (dirty) setDiscardThen("close");
    else onClose();
  }

  function requestDuplicate() {
    if (saving || discardOpen || !onDuplicate) return;
    if (dirty) setDiscardThen("duplicate");
    else onDuplicate();
  }

  useDialogFocus(!suspended && !discardOpen, dialogRef, requestClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Reloading or closing the browser tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function patch(next: Partial<DishDraft>) {
    setSaveError(null);
    setDraft((current) => ({ ...current, ...next }));
  }

  function setText(field: TextField, value: string) {
    setSaveError(null);
    setDraft((current) => ({ ...current, [field]: { ...current[field], [lang]: value } }));
  }

  /** Another language with a name, to copy a translation from. */
  const copySource = MENU_LOCALES.find((code) => code !== lang && draft.name[code].trim() !== "");
  const canCopy =
    copySource !== undefined &&
    (["name", "description", "ingredients"] as const).some(
      (field) => !draft[field][lang].trim() && draft[field][copySource].trim(),
    );

  function copyFromSource() {
    if (!copySource) return;
    setDraft((current) => {
      const next = { ...current };
      for (const field of ["name", "description", "ingredients"] as const) {
        if (!current[field][lang].trim() && current[field][copySource].trim()) {
          next[field] = { ...current[field], [lang]: current[field][copySource] };
        }
      }
      return next;
    });
  }

  const langMissing = (code: LocaleCode) =>
    !isBlankText(draft.name) &&
    (needsTranslation(draft.name, code) || (!isBlankText(draft.description) && needsTranslation(draft.description, code)));

  const categoryOptions = useMemo(
    () => [
      ...categories.map((category) => ({ value: category.key, label: textIn(category.names, locale) })),
      { value: NEW_CATEGORY, label: m.newCategoryOption },
    ],
    [categories, locale, m.newCategoryOption],
  );

  const suggestions = useMemo(
    () => starterCategories().filter((names) => !findCategoryByName(categories, names)),
    [categories],
  );

  const errorText = (key: keyof DraftErrors): string | null => {
    const error = visibleErrors[key];
    if (!error) return null;
    if (key === "name") return m.errName;
    if (key === "category") return m.errCategory;
    if (key === "imageUrl") return m.errUrl;
    if (key === "portion") return m.errPortion;
    if (error === "required") return m.errPriceRequired;
    if (error === "notWhole") return m.errPriceWhole;
    if (error === "tooLow") return m.errPriceLow;
    return m.errPriceHigh;
  };

  function focusFirstError(found: DraftErrors) {
    const order: (keyof DraftErrors)[] = ["name", "category", "price", "portion", "imageUrl"];
    const first = order.find((key) => found[key]);
    if (!first) return;
    const target =
      first === "category"
        ? document.getElementById(fieldId("newcat-ru"))
        : document.getElementById(fieldId(first === "imageUrl" ? "photo" : first));
    target?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setShowErrors(true);
    const found = validateDraft(draft);
    if (Object.keys(found).length > 0) {
      setSaveError(m.fixErrors);
      // Let the error state render, then move focus to the first problem.
      window.requestAnimationFrame(() => focusFirstError(found));
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ok = await onSave(draftToPayload(draft, initial, categories));
    if (!ok) {
      setSaving(false);
      setSaveError(m.saveFailed);
    }
  }

  const preview = useMemo(() => {
    const payload = draftToPayload(draft, initial, categories);
    if (isBlankText(draft.name)) payload.name = { ru: m.previewName, en: m.previewName, ro: m.previewName };
    return previewItem(payload, venueId);
  }, [draft, initial, categories, venueId, m.previewName]);

  const title = textIn(draft.name, locale) || (mode === "new" ? m.newDishTitle : m.editDishTitle);
  const tagChips: { tag: string; label: string; icon?: ReactNode }[] = [
    { tag: "popular", label: t("menu_page.tag_popular") },
    { tag: "vegetarian", label: t("menu_page.tag_vegetarian"), icon: <LeafIcon className="menu-tag-icon" /> },
    { tag: "spicy", label: t("menu_page.tag_spicy"), icon: <FlameIcon className="menu-tag-icon" /> },
  ];
  const customAllergens = draft.allergens.filter((code) => !(ALLERGEN_CODES as readonly string[]).includes(code));

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cm-editor-root" role="presentation">
      <button type="button" className="cm-editor-backdrop" tabIndex={-1} aria-label={m.close} onClick={requestClose} />
      <section
        ref={dialogRef}
        className="cm-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={fieldId("title")}
      >
        <header className="cm-editor-head">
          <div>
            <span className="cm-kicker">{mode === "new" ? m.newDishTitle : m.editDishTitle}</span>
            <h3 id={fieldId("title")}>{title}</h3>
          </div>
          {item?.stopped ? <span className="cm-pill is-stopped">{ui.stoppedBadge}</span> : null}
          <button type="button" className="cm-icon-btn" onClick={requestClose} aria-label={m.close}>
            <CloseIcon />
          </button>
        </header>

        <div className="cm-editor-body">
          <form id={fieldId("form")} className="cm-form" noValidate onSubmit={(event) => void submit(event)}>
            {/* Texts in three languages */}
            <fieldset className="cm-fieldset">
              <div className="cm-lang-row">
                <div className="cm-seg" role="group" aria-label={m.languagesLabel}>
                  {MENU_LOCALES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={code === lang ? "active" : ""}
                      aria-pressed={code === lang}
                      onClick={() => setLang(code)}
                    >
                      {LANG_CODE[code]}
                      {langMissing(code) ? (
                        <i className="cm-lang-dot" aria-label={m.langMissing} title={m.langMissing} />
                      ) : null}
                    </button>
                  ))}
                </div>
                {canCopy && copySource ? (
                  <button type="button" className="cm-link-btn" onClick={copyFromSource}>
                    {m.copyFrom.replace("{lang}", LANG_CODE[copySource])}
                  </button>
                ) : null}
              </div>
              <p className="cm-hint">{m.langHint}</p>

              <div className="cm-field">
                <label htmlFor={fieldId("name")}>
                  {m.nameLabel} <span className="cm-lang-tag">{LANG_CODE[lang]}</span>
                </label>
                <input
                  id={fieldId("name")}
                  className="cm-input cm-input-lg"
                  value={draft.name[lang]}
                  onChange={(event) => setText("name", event.target.value)}
                  placeholder={m.namePlaceholder}
                  maxLength={120}
                  autoComplete="off"
                  data-autofocus
                  aria-invalid={visibleErrors.name ? true : undefined}
                  aria-describedby={visibleErrors.name || sameName ? fieldId("name-msg") : undefined}
                />
                {errorText("name") ? (
                  <p id={fieldId("name-msg")} className="cm-error">{errorText("name")}</p>
                ) : sameName ? (
                  <p id={fieldId("name-msg")} className="cm-warn">
                    {m.sameName.replace("{name}", textIn(sameName.name, locale))}
                  </p>
                ) : null}
              </div>

              <div className="cm-field">
                <label htmlFor={fieldId("description")}>
                  {m.descriptionLabel} <span className="cm-lang-tag">{LANG_CODE[lang]}</span>
                </label>
                <textarea
                  id={fieldId("description")}
                  className="cm-input"
                  rows={2}
                  maxLength={300}
                  value={draft.description[lang]}
                  onChange={(event) => setText("description", event.target.value)}
                />
                <p className="cm-hint">{m.descriptionHint}</p>
              </div>

              <div className="cm-field">
                <label htmlFor={fieldId("ingredients")}>
                  {m.ingredientsLabel} <span className="cm-lang-tag">{LANG_CODE[lang]}</span>
                </label>
                <textarea
                  id={fieldId("ingredients")}
                  className="cm-input"
                  rows={2}
                  maxLength={1000}
                  value={draft.ingredients[lang]}
                  onChange={(event) => setText("ingredients", event.target.value)}
                />
                <p className="cm-hint">{m.ingredientsHint}</p>
              </div>
            </fieldset>

            {/* Category, price, portion */}
            <div className="cm-grid">
              <div className="cm-field cm-span-2">
                <label id={fieldId("category-label")} htmlFor={fieldId("category")}>
                  {m.categoryLabel}
                </label>
                <SelectMenu
                  id={fieldId("category")}
                  ariaLabelledBy={fieldId("category-label")}
                  value={draft.categoryKey}
                  options={categoryOptions}
                  fullWidth
                  onChange={(value) => patch({ categoryKey: value })}
                />
              </div>

              {draft.categoryKey === NEW_CATEGORY ? (
                <div className="cm-newcat cm-span-2">
                  <p className="cm-subhead">{m.newCategoryLabel}</p>
                  <p className="cm-hint">{m.newCategoryHint}</p>
                  <div className="cm-newcat-inputs">
                    {MENU_LOCALES.map((code) => (
                      <label key={code} className="cm-inline-field">
                        <span>{LANG_CODE[code]}</span>
                        <input
                          id={fieldId(`newcat-${code}`)}
                          className="cm-input"
                          value={draft.newCategory[code]}
                          maxLength={60}
                          autoComplete="off"
                          aria-invalid={visibleErrors.category ? true : undefined}
                          onChange={(event) =>
                            patch({ newCategory: { ...draft.newCategory, [code]: event.target.value } })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {suggestions.length > 0 ? (
                    <div className="cm-suggest">
                      <span>{m.suggestions}</span>
                      {suggestions.map((names) => (
                        <button
                          key={names.ru}
                          type="button"
                          className="cm-chip"
                          onClick={() => patch({ newCategory: { ...names } })}
                        >
                          {names[locale]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {errorText("category") ? <p className="cm-error">{errorText("category")}</p> : null}
                </div>
              ) : null}

              <div className="cm-field">
                <label htmlFor={fieldId("price")}>{m.priceLabel}</label>
                <div className={`cm-affix${visibleErrors.price ? " is-invalid" : ""}`}>
                  <input
                    id={fieldId("price")}
                    className="cm-input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={draft.price}
                    onChange={(event) => patch({ price: event.target.value })}
                    aria-invalid={visibleErrors.price ? true : undefined}
                    aria-describedby={visibleErrors.price ? fieldId("price-msg") : undefined}
                  />
                  <span aria-hidden="true">MDL</span>
                </div>
                {errorText("price") ? (
                  <p id={fieldId("price-msg")} className="cm-error">{errorText("price")}</p>
                ) : null}
              </div>

              <div className="cm-field">
                <label htmlFor={fieldId("portion")}>{m.portionLabel}</label>
                <div className="cm-portion">
                  <input
                    id={fieldId("portion")}
                    className="cm-input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={draft.portionUnit === "ml" ? "330" : "250"}
                    value={draft.portion}
                    onChange={(event) => patch({ portion: event.target.value })}
                    aria-invalid={visibleErrors.portion ? true : undefined}
                    aria-describedby={visibleErrors.portion ? fieldId("portion-msg") : undefined}
                  />
                  <div className="cm-seg is-small" role="group" aria-label={m.unitLabel}>
                    {(["g", "ml"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        className={draft.portionUnit === unit ? "active" : ""}
                        aria-pressed={draft.portionUnit === unit}
                        onClick={() => patch({ portionUnit: unit })}
                      >
                        {unit === "g" ? m.unitG : m.unitMl}
                      </button>
                    ))}
                  </div>
                </div>
                {errorText("portion") ? (
                  <p id={fieldId("portion-msg")} className="cm-error">{errorText("portion")}</p>
                ) : null}
              </div>
            </div>

            {/* Availability */}
            <div className="cm-switch-row">
              <div>
                <p className="cm-subhead" id={fieldId("available-label")}>{m.availableLabel}</p>
                <p className="cm-hint">{m.availableHint}</p>
              </div>
              <Switch
                checked={draft.available}
                labelledBy={fieldId("available-label")}
                onChange={(available) => patch({ available })}
              />
            </div>

            {/* Labels */}
            <div className="cm-field">
              <p className="cm-subhead">{m.marksLabel}</p>
              <div className="cm-chips">
                {tagChips.map(({ tag, label, icon }) => (
                  <button
                    key={tag}
                    type="button"
                    className={`cm-chip is-${tag}${draft.tags.includes(tag) ? " active" : ""}`}
                    aria-pressed={draft.tags.includes(tag)}
                    onClick={() => patch({ tags: toggleTag(draft.tags, tag) })}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`cm-chip is-adult${draft.containsAlcohol ? " active" : ""}`}
                  aria-pressed={draft.containsAlcohol}
                  onClick={() => patch({ containsAlcohol: !draft.containsAlcohol })}
                >
                  {m.alcohol}
                </button>
                <button
                  type="button"
                  className={`cm-chip is-adult${draft.adultOnly || draft.containsAlcohol ? " active" : ""}`}
                  aria-pressed={draft.adultOnly || draft.containsAlcohol}
                  disabled={draft.containsAlcohol}
                  onClick={() => patch({ adultOnly: !draft.adultOnly })}
                >
                  {m.adultOnly}
                </button>
              </div>
              {draft.containsAlcohol || draft.adultOnly ? <p className="cm-hint">{m.adultHint}</p> : null}
            </div>

            {/* Allergens */}
            <div className="cm-field">
              <p className="cm-subhead">{m.allergensLabel}</p>
              <p className="cm-hint">{m.allergensHint}</p>
              <div className="cm-chips">
                {ALLERGEN_CODES.map((code) => {
                  const on = draft.allergens.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`cm-chip is-allergen${on ? " active" : ""}`}
                      aria-pressed={on}
                      onClick={() => patch({ allergens: toggleAllergen(draft.allergens, code) })}
                    >
                      {capitalize(allergenLabel(t, code), locale)}
                    </button>
                  );
                })}
                {customAllergens.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className="cm-chip is-allergen active"
                    aria-label={m.removeAllergen.replace("{name}", code)}
                    onClick={() => patch({ allergens: draft.allergens.filter((a) => a !== code) })}
                  >
                    {code} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Photo */}
            <div className="cm-field">
              <label htmlFor={fieldId("photo")}>{m.photoLabel}</label>
              <div className="cm-photo">
                <div className="cm-photo-thumb" aria-hidden="true">
                  {imageUrl && !errors.imageUrl && !photoBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-provided remote link
                    <img
                      key={imageUrl}
                      src={mediaUrl(imageUrl)}
                      alt=""
                      onError={() => setBrokenUrl(imageUrl)}
                    />
                  ) : (
                    <ImageIcon />
                  )}
                </div>
                <div className="cm-photo-input">
                  <input
                    id={fieldId("photo")}
                    className="cm-input"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder={m.photoPlaceholder}
                    value={draft.imageUrl}
                    onChange={(event) => patch({ imageUrl: event.target.value })}
                    aria-invalid={visibleErrors.imageUrl ? true : undefined}
                  />
                  {imageUrl ? (
                    <button type="button" className="cm-link-btn" onClick={() => patch({ imageUrl: "" })}>
                      {m.photoRemove}
                    </button>
                  ) : null}
                </div>
              </div>
              {errorText("imageUrl") ? (
                <p className="cm-error">{errorText("imageUrl")}</p>
              ) : photoBroken ? (
                <p className="cm-warn">{m.photoBroken}</p>
              ) : (
                <p className="cm-hint">{m.photoHint}</p>
              )}
            </div>
          </form>

          {/* Guest preview */}
          <aside className="cm-preview" aria-label={m.previewTitle}>
            <div className="cm-preview-head">
              <p className="cm-subhead">
                {m.previewTitle} <span className="cm-lang-tag" title={m.previewLanguage}>{LANG_CODE[lang]}</span>
              </p>
              <div className="cm-seg is-small" role="group" aria-label={m.previewTitle}>
                {(["list", "card"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={previewView === view ? "active" : ""}
                    aria-pressed={previewView === view}
                    onClick={() => setPreviewView(view)}
                  >
                    {view === "list" ? m.previewList : m.previewCard}
                  </button>
                ))}
              </div>
            </div>
            {!draft.available ? <p className="cm-note">{m.previewHidden}</p> : null}
            <div className={`cm-preview-stage is-${previewView}`} inert>
              <LocaleScope locale={lang}>
                <GuestPreview item={preview} view={previewView} />
              </LocaleScope>
            </div>
          </aside>
        </div>

        <footer className="cm-editor-foot">
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              className="panel-btn ghost danger cm-btn"
              aria-label={m.deleteLabel.replace("{name}", title)}
              disabled={saving}
              onClick={onDelete}
            >
              <TrashIcon />
              <span className="cm-btn-text">{m.bulkDelete}</span>
            </button>
          ) : null}
          {mode === "edit" && onDuplicate ? (
            <button
              type="button"
              className="panel-btn ghost cm-btn"
              aria-label={m.duplicateLabel.replace("{name}", title)}
              disabled={saving}
              onClick={requestDuplicate}
            >
              <CopyIcon />
              <span className="cm-btn-text">{m.duplicate}</span>
            </button>
          ) : null}
          <p className={`cm-foot-status${saveError ? " is-error" : ""}`} role={saveError ? "alert" : "status"}>
            {saveError ?? (dirty ? m.unsaved : "")}
          </p>
          <button type="button" className="panel-btn ghost cm-btn" disabled={saving} onClick={requestClose}>
            {m.cancel}
          </button>
          <button type="submit" form={fieldId("form")} className="panel-btn primary cm-btn" disabled={saving}>
            {saving ? m.saving : mode === "new" ? m.addToMenu : m.save}
          </button>
        </footer>
      </section>

      <CabinetConfirmDialog
        open={discardOpen}
        tone="warning"
        title={m.discardTitle}
        text={m.discardText}
        confirmLabel={m.discardConfirm}
        cancelLabel={m.keepEditing}
        onConfirm={() => {
          const then = discardThen;
          setDiscardThen(null);
          if (then === "duplicate") onDuplicate?.();
          else onClose();
        }}
        onCancel={() => setDiscardThen(null)}
      />
    </div>,
    document.body,
  );
}

function GuestPreview({ item, view }: { item: MenuItem; view: "list" | "card" }) {
  const { locale, t } = useLocale();
  if (view === "card") {
    return (
      <div className="cm-preview-card">
        <MenuDishDetails item={item} titleId="cm-preview-title" />
      </div>
    );
  }
  return (
    <ul className="menu-dishes cm-preview-list">
      <MenuDish item={item} qty={0} locale={locale} t={t} onChangeQty={() => undefined} onOpen={() => undefined} />
    </ul>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={`cm-switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

const iconBase = {
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

export function CloseIcon() {
  return (
    <svg {...iconBase}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...iconBase}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...iconBase}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...iconBase}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg {...iconBase} width={22} height={22} strokeWidth={1.6}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
