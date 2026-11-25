// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectMenu, computePopoverCoords, type SelectMenuOption } from "./select-menu";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const OPTIONS: SelectMenuOption[] = [
  { value: "waiter", label: "Официант", color: "#3b82f6" },
  { value: "cook", label: "Повар", color: "#f59e0b" },
  { value: "chef", label: "Шеф-повар", color: "#ef4444" },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(props: Partial<Parameters<typeof SelectMenu>[0]> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = props.onChange ?? vi.fn();
  act(() => {
    root!.render(
      createElement(SelectMenu, {
        value: "waiter",
        onChange,
        options: OPTIONS,
        ariaLabel: "Роль",
        ...props,
      }),
    );
  });
  return { onChange, trigger: container.querySelector("button")! };
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe("SelectMenu", () => {
  it("opens on click, exposes listbox/options, and selects an option", () => {
    const onChange = vi.fn();
    const { trigger } = mount({ onChange });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    act(() => {
      trigger.click();
    });

    const listbox = document.querySelector('[role="listbox"]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
    expect(opts).toHaveLength(3);
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    expect(opts[1].getAttribute("aria-selected")).toBe("false");

    act(() => {
      opts[1].click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("cook");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("supports keyboard navigation (ArrowDown, ArrowUp, Home, End, Enter) and Escape", () => {
    const onChange = vi.fn();
    const { trigger } = mount({ onChange });

    act(() => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox).not.toBeNull();

    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(document.querySelectorAll('[role="option"]')[2].classList.contains("is-active")).toBe(true);

    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(document.querySelectorAll('[role="option"]')[0].classList.contains("is-active")).toBe(true);

    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("cook");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Re-open with Space and dismiss with Escape without calling onChange again
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on outside click and respects disabled state", () => {
    const onChange = vi.fn();
    const { trigger } = mount({ onChange });

    act(() => {
      trigger.click();
    });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    act(() => {
      root!.render(
        createElement(SelectMenu, {
          value: "waiter",
          onChange,
          options: OPTIONS,
          disabled: true,
        }),
      );
    });
    const disabledTrigger = container!.querySelector("button")!;
    act(() => {
      disabledTrigger.click();
    });
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("flips upward near the bottom of the viewport and clamps to phone width", () => {
    const coords = computePopoverCoords(
      { top: 760, bottom: 804, left: 260, right: 382, width: 122 },
      { width: 390, height: 844 },
      { width: 220, height: 240 },
      "end",
    );
    expect(coords.placement).toBe("top");
    expect(coords.bottom).toBeGreaterThan(0);
    expect(coords.left).toBeGreaterThanOrEqual(8);
    expect(coords.left + coords.minWidth).toBeLessThanOrEqual(382);
  });

  it("supports type-ahead matching and skips disabled options", () => {
    const onChange = vi.fn();
    const { trigger } = mount({
      value: "waiter",
      onChange,
      options: [
        { value: "waiter", label: "Официант", color: "#3b82f6" },
        { value: "cook", label: "Повар", disabled: true },
        { value: "chef", label: "Шеф-повар", color: "#ef4444" },
      ],
    });

    act(() => {
      trigger.click();
    });

    const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
    // ArrowDown from index 0 should skip disabled index 1 and activate index 2
    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.querySelectorAll('[role="option"]')[2].classList.contains("is-active")).toBe(true);

    // Type-ahead 'о' should wrap back to 'Официант' (index 0)
    act(() => {
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "о", bubbles: true }));
    });
    expect(document.querySelectorAll('[role="option"]')[0].classList.contains("is-active")).toBe(true);
  });
});
