"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Clicks that take the owner away from the open cabinet tab: links, the other cabinet
 * tabs, the venue switcher and the panel's log-out button.
 */
const LEAVE_TRIGGERS = [
  "a[href]",
  '.owner-nav [role="tab"]:not([aria-selected="true"])',
  ".owner-venue-switcher button",
  ".panel-top-actions button",
].join(", ");

/** How long a confirmed leave stays unguarded (the click and the unload it starts). */
const RELEASE_MS = 1500;

/** A same-tab navigation the guard should stop (not a new tab, download, anchor, mail or phone link). */
function leavesPage(link: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;
  const href = link.getAttribute("href") ?? "";
  return href !== "" && !href.startsWith("#") && !/^(mailto|tel):/i.test(href);
}

/**
 * While `active`, asks before the owner leaves with unsaved changes: the browser prompt on
 * reload / close, and `onBlocked(resume)` for in-app clicks outside `container`. Calling
 * `resume()` repeats the click without the guard.
 */
export function useLeaveGuard(
  active: boolean,
  container: RefObject<HTMLElement | null>,
  onBlocked: (resume: () => void) => void,
) {
  const onBlockedRef = useRef(onBlocked);
  /**
   * Set by `resume()`: the repeated click goes through, and so does the page unload it may
   * start a moment later (no second browser prompt). Cleared after a short while in case the
   * click did not leave the page.
   */
  const bypassRef = useRef(false);
  useEffect(() => {
    onBlockedRef.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return;

    let releaseTimer: number | undefined;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (bypassRef.current) return;
      event.preventDefault();
      // Older browsers still need returnValue set to show the prompt.
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (bypassRef.current || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest<HTMLElement>(LEAVE_TRIGGERS);
      if (!trigger || container.current?.contains(trigger)) return;
      if (trigger instanceof HTMLAnchorElement && !leavesPage(trigger, event)) return;
      event.preventDefault();
      event.stopPropagation();
      onBlockedRef.current(() => {
        bypassRef.current = true;
        window.clearTimeout(releaseTimer);
        releaseTimer = window.setTimeout(() => {
          bypassRef.current = false;
        }, RELEASE_MS);
        trigger.click();
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase on the document runs before React's own listeners on the app root.
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(releaseTimer);
      bypassRef.current = false;
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, container]);
}
