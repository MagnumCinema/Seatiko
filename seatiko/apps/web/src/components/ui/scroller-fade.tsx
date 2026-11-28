"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";

type ScrollerFadeProps = {
  children: ReactNode;
  /** Classes of the scrolling row itself (its gap, chip sizes…). */
  trackClassName?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  /** Scroll the active chip into view when it changes (e.g. the picked day). */
  activeKey?: string | number | null;
};

/**
 * A horizontal row that never looks cut off: edges fade where more chips hide,
 * and on a mouse device ‹ › buttons scroll it. Phones swipe; the fade is the cue.
 */
export function ScrollerFade({
  children,
  trackClassName = "",
  className = "",
  role,
  ariaLabel,
  ariaLabelledBy,
  activeKey,
}: ScrollerFadeProps) {
  const { t } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft < max - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [measure, children]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || activeKey == null) return;
    const active = el.querySelector<HTMLElement>(".is-active, [aria-pressed='true'], [aria-selected='true']");
    if (!active) return;
    const left = active.offsetLeft - el.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, left - 24), behavior: "smooth" });
    }
  }, [activeKey]);

  function scrollBy(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  }

  return (
    <div
      className={`sfade${edges.start ? " can-back" : ""}${edges.end ? " can-forward" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        className="btn btn--secondary btn--sm btn--icon sfade-arrow is-back"
        aria-label={t("scroller.back")}
        tabIndex={-1}
        onClick={() => scrollBy(-1)}
      >
        ‹
      </button>
      <div
        ref={trackRef}
        className={`sfade-track ${trackClassName}`.trim()}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onScroll={measure}
      >
        {children}
      </div>
      <button
        type="button"
        className="btn btn--secondary btn--sm btn--icon sfade-arrow is-forward"
        aria-label={t("scroller.forward")}
        tabIndex={-1}
        onClick={() => scrollBy(1)}
      >
        ›
      </button>
    </div>
  );
}
