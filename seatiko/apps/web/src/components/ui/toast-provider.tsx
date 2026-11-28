"use client";

import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "@/components/locale-provider";
import { Button, IconButton } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/modal-shell";

export const TOAST_DEFAULT_MS = 4500;
/** At most this many toasts on screen; a newer one settles the oldest. */
export const TOAST_MAX = 3;

export type ToastOptions = {
  message: string;
  /** Button in the toast, e.g. "Вернуть" (Undo). Pressing it does not run onExpire. */
  actionLabel?: string;
  onAction?: () => void;
  /** The toast went away without its action: time ran out, × or a newer toast pushed it out. */
  onExpire?: () => void;
  duration?: number;
  tone?: "default" | "success" | "error";
};

type ToastItem = ToastOptions & { id: number; duration: number };

type ToastApi = {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const noop: ToastApi = {
  show: (options) => {
    options.onExpire?.();
    return 0;
  },
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi | null>(null);

/** Toasts outside the provider (unit tests) settle at once, so deferred actions still run. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop;
}

/** One queue of short notices for the whole site; bottom-right on desktop, top on phones. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const itemsRef = useRef<ToastItem[]>([]);
  const nextId = useRef(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const settle = useCallback((id: number, how: "expire" | "action") => {
    const item = itemsRef.current.find((toast) => toast.id === id);
    if (!item) return;
    itemsRef.current = itemsRef.current.filter((toast) => toast.id !== id);
    setItems(itemsRef.current);
    if (how === "action") item.onAction?.();
    else item.onExpire?.();
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const item: ToastItem = { ...options, id, duration: options.duration ?? TOAST_DEFAULT_MS };
      const overflow = itemsRef.current.length + 1 - TOAST_MAX;
      const pushedOut = overflow > 0 ? itemsRef.current.slice(0, overflow) : [];
      itemsRef.current = [...itemsRef.current.slice(Math.max(0, overflow)), item];
      setItems(itemsRef.current);
      pushedOut.forEach((toast) => toast.onExpire?.());
      return id;
    },
    [],
  );

  const dismiss = useCallback((id: number) => settle(id, "expire"), [settle]);

  // Leaving the page settles pending toasts (a deferred cancel still goes through).
  useEffect(() => {
    const flush = () => {
      const pending = itemsRef.current;
      itemsRef.current = [];
      pending.forEach((toast) => toast.onExpire?.());
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(<ToastRegion items={items} onSettle={settle} />, document.body)
        : null}
    </ToastContext.Provider>
  );
}

function ToastRegion({
  items,
  onSettle,
}: {
  items: ToastItem[];
  onSettle: (id: number, how: "expire" | "action") => void;
}) {
  const { t } = useLocale();
  return (
    <div className="toast-region" role="region" aria-label={t("toast.region")}>
      {items.map((item) => (
        <Toast key={item.id} item={item} onSettle={onSettle} closeLabel={t("common.close")} />
      ))}
    </div>
  );
}

function Toast({
  item,
  onSettle,
  closeLabel,
}: {
  item: ToastItem;
  onSettle: (id: number, how: "expire" | "action") => void;
  closeLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onSettle(item.id, "expire"), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, item.id, onSettle]);

  return (
    <div
      className={`toast toast--${item.tone ?? "default"}${paused ? " is-paused" : ""}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ ["--toast-ms" as string]: `${item.duration}ms` }}
    >
      <p className="toast-message">{item.message}</p>
      {item.actionLabel ? (
        <Button variant="secondary" size="sm" className="toast-action" onClick={() => onSettle(item.id, "action")}>
          {item.actionLabel}
        </Button>
      ) : null}
      <IconButton
        variant="ghost"
        size="sm"
        className="toast-close"
        label={closeLabel}
        icon={<CloseIcon />}
        onClick={() => onSettle(item.id, "expire")}
      />
      <span className="toast-progress" aria-hidden="true" />
    </div>
  );
}
