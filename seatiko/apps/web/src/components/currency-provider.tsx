"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BUDGET_CURRENCY_IDS,
  isBudgetCurrencyId,
  type BudgetCurrencyId,
} from "@/lib/discover-preferences";

const STORAGE_KEY = "fa_currency";
const DEFAULT_CURRENCY: BudgetCurrencyId = "MDL";

type CurrencyContextValue = {
  currency: BudgetCurrencyId;
  setCurrency: (currency: BudgetCurrencyId) => void;
  currencies: readonly BudgetCurrencyId[];
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStoredCurrency(): BudgetCurrencyId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isBudgetCurrencyId(raw.toUpperCase())) {
      return raw.toUpperCase() as BudgetCurrencyId;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] =
    useState<BudgetCurrencyId>(DEFAULT_CURRENCY);

  useEffect(() => {
    const stored = readStoredCurrency();
    queueMicrotask(() => setCurrencyState(stored));

    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue?.toUpperCase() ?? "";
      if (isBudgetCurrencyId(next)) setCurrencyState(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const setCurrency = useCallback((next: BudgetCurrencyId) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      currencies: BUDGET_CURRENCY_IDS,
    }),
    [currency, setCurrency],
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency requires CurrencyProvider");
  return ctx;
}
