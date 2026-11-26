// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useLeaveGuard } from "./use-leave-guard";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** Cabinet-like page: a tab list, a venue switcher, a link and the guarded form. */
function mount(active: boolean, onBlocked: (resume: () => void) => void) {
  host = document.createElement("div");
  host.innerHTML = `
    <nav class="owner-nav">
      <button role="tab" aria-selected="true" id="tab-rules">Rules</button>
      <button role="tab" aria-selected="false" id="tab-menu">Menu</button>
    </nav>
    <div class="owner-venue-switcher"><button id="venue-b">Venue B</button></div>
    <a href="/account" id="link">Profile</a>
    <a href="/venues/1" target="_blank" id="new-tab">Page</a>
    <div id="form-slot"></div>`;
  document.body.appendChild(host);
  const slot = host.querySelector("#form-slot")!;
  function Form() {
    const ref = useRef<HTMLDivElement>(null);
    useLeaveGuard(active, ref, onBlocked);
    return createElement("div", { ref }, createElement("a", { href: "/inside", id: "inside" }, "inside"));
  }
  root = createRoot(slot);
  act(() => root!.render(createElement(Form)));
}

function click(id: string) {
  const el = document.getElementById(id)!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(event);
  return event;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("useLeaveGuard", () => {
  it("stops another tab, the venue switcher and same-tab links while active", () => {
    const onBlocked = vi.fn();
    mount(true, onBlocked);
    const menuClick = vi.fn();
    document.getElementById("tab-menu")!.addEventListener("click", menuClick);

    expect(click("tab-menu").defaultPrevented).toBe(true);
    expect(menuClick).not.toHaveBeenCalled();
    expect(click("venue-b").defaultPrevented).toBe(true);
    expect(click("link").defaultPrevented).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(3);
  });

  it("lets through the current tab, new-tab links and clicks inside the form", () => {
    const onBlocked = vi.fn();
    mount(true, onBlocked);
    click("tab-rules");
    click("new-tab");
    click("inside");
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("repeats the click unguarded when the owner chooses to leave", () => {
    let resume: (() => void) | null = null;
    mount(true, (r) => {
      resume = r;
    });
    const menuClick = vi.fn();
    document.getElementById("tab-menu")!.addEventListener("click", menuClick);
    click("tab-menu");
    expect(menuClick).not.toHaveBeenCalled();
    act(() => resume!());
    expect(menuClick).toHaveBeenCalledTimes(1);
  });

  it("does not ask the browser again for the page change the owner already confirmed", () => {
    let resume: (() => void) | null = null;
    mount(true, (r) => {
      resume = r;
    });
    click("link");
    act(() => resume!());
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while there are no unsaved changes", () => {
    const onBlocked = vi.fn();
    mount(false, onBlocked);
    expect(click("tab-menu").defaultPrevented).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("asks the browser to confirm a reload or close", () => {
    mount(true, vi.fn());
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
