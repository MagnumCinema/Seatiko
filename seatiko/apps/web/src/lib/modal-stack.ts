/**
 * Open dialogs, newest last. Only the top one reacts to Esc / Tab, so a confirm
 * opened over the booking popup closes alone and keeps focus inside itself.
 */
const stack: number[] = [];
let nextId = 1;

export function pushModal(): number {
  const id = nextId++;
  stack.push(id);
  return id;
}

export function popModal(id: number) {
  const index = stack.lastIndexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

export function isTopModal(id: number): boolean {
  return stack[stack.length - 1] === id;
}

export function openModalCount(): number {
  return stack.length;
}

let lockCount = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

/**
 * Stops the page behind a dialog from scrolling (counted, so nested dialogs work)
 * and pads the body by the scrollbar width so the page does not jump sideways.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  if (lockCount === 0) {
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    body.dataset.modalOpen = "true";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && saved) {
      body.style.overflow = saved.overflow;
      body.style.paddingRight = saved.paddingRight;
      delete body.dataset.modalOpen;
      saved = null;
    }
  };
}
