"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ru from "../../messages/ru.json";
import en from "../../messages/en.json";
import ro from "../../messages/ro.json";

export type Locale = "ru" | "en" | "ro";

const dictionaries = { ru, en, ro } as const;

type Dict = (typeof dictionaries)[Locale];
export type MessageKey = keyof Dict;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  let value: string = dictionaries[locale][key] ?? dictionaries.en[key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.split(`{${k}}`).join(String(v));
    }
  }
  return value;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    const saved = localStorage.getItem("fa_locale") as Locale | null;
    if (saved && dictionaries[saved]) {
      queueMicrotask(() => setLocaleState(saved));
      document.documentElement.lang = saved;
    }

    const syncLocale = (event: StorageEvent) => {
      const next = event.newValue as Locale | null;
      if (event.key === "fa_locale" && next && dictionaries[next]) {
        setLocaleState(next);
        document.documentElement.lang = next;
      }
    };
    window.addEventListener("storage", syncLocale);
    return () => window.removeEventListener("storage", syncLocale);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("fa_locale", l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

/** Renders its children as the site would look in `locale` (owner previews of guest pages). */
export function LocaleScope({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const { setLocale } = useLocale();
  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
