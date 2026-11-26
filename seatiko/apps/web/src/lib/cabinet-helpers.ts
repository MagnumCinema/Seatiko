export type PluralForms = { one: string; few: string; many: string; other: string };

const PLURAL_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", ro: "ro-RO" };

/** Picks the grammatical form for `count` (1 запись / 2 записи / 5 записей). */
export function pluralize(count: number, forms: PluralForms, locale: string): string {
  const rule = new Intl.PluralRules(PLURAL_LOCALES[locale] ?? "en-US").select(count);
  if (rule === "one" || rule === "few" || rule === "many") return forms[rule];
  return forms.other;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function photoProblem(file: { size: number; type: string }): "type" | "size" | null {
  if (!PHOTO_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "size";
  return null;
}
