// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Button,
  ButtonLink,
  IconButton,
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./button";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
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

describe("buttonClassName", () => {
  it("maps every variant and size to the expected BEM classes", () => {
    const variants: ButtonVariant[] = [
      "primary",
      "secondary",
      "ghost",
      "link",
      "danger-outline",
      "danger",
    ];
    const sizes: ButtonSize[] = ["sm", "md", "lg"];

    for (const variant of variants) {
      for (const size of sizes) {
        const cls = buttonClassName({ variant, size });
        expect(cls).toContain("btn");
        expect(cls).toContain(`btn--${variant}`);
        if (variant === "link") {
          expect(cls).not.toContain(`btn--${size}`);
        } else {
          expect(cls).toContain(`btn--${size}`);
        }
      }
    }
  });

  it("handles block, icon, shimmer, loading, and custom classes", () => {
    expect(buttonClassName({ variant: "primary", size: "lg", block: true })).toBe(
      "btn btn--primary btn--lg btn--block",
    );
    expect(buttonClassName({ variant: "secondary", icon: true, size: "sm", block: true })).toBe(
      "btn btn--secondary btn--sm btn--icon",
    );
    expect(buttonClassName({ variant: "primary", shimmer: true, loading: true, className: "hero-cta" })).toBe(
      "btn btn--primary btn--md btn--shimmer is-loading hero-cta",
    );
    expect(buttonClassName({ variant: "secondary", shimmer: true })).not.toContain("btn--shimmer");
  });
});

describe("Button", () => {
  it("defaults to type='button' and wraps content in .btn-content", () => {
    const host = renderNode(createElement(Button, null, "Confirm booking"));
    const btn = host.querySelector("button")!;
    expect(btn.type).toBe("button");
    expect(btn.className).toBe("btn btn--primary btn--md");
    expect(btn.querySelector(".btn-content")?.textContent).toBe("Confirm booking");
  });

  it("supports disabled and loading states without invoking onClick", () => {
    const onClick = vi.fn();
    const host = renderNode(
      createElement(
        "div",
        null,
        createElement(Button, { loading: true, onClick }, "Confirmă rezervarea"),
        createElement(Button, { disabled: true, onClick }, "Anulează rezervarea"),
      ),
    );
    const buttons = host.querySelectorAll("button");
    const loadingBtn = buttons[0];
    const disabledBtn = buttons[1];

    expect(loadingBtn.disabled).toBe(true);
    expect(loadingBtn.getAttribute("aria-busy")).toBe("true");
    expect(loadingBtn.getAttribute("data-loading")).toBe("true");
    expect(loadingBtn.querySelector(".btn-content")?.textContent).toBe("Confirmă rezervarea");

    expect(disabledBtn.disabled).toBe(true);
    expect(disabledBtn.getAttribute("data-loading")).toBeNull();

    act(() => {
      loadingBtn.click();
      disabledBtn.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("invokes onClick when enabled and respects explicit submit type", () => {
    const onClick = vi.fn();
    const host = renderNode(
      createElement(Button, { type: "submit", variant: "secondary", onClick }, "Сохранить"),
    );
    const btn = host.querySelector("button")!;
    expect(btn.type).toBe("submit");
    act(() => {
      btn.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("IconButton", () => {
  it("requires an accessible label prop at type level and sets aria-label + icon classes", () => {
    const host = renderNode(
      createElement(IconButton, {
        label: "Закрыть",
        size: "sm",
        variant: "secondary",
        icon: createElement("span", { "aria-hidden": true }, "✕"),
      }),
    );
    const btn = host.querySelector("button")!;
    expect(btn.getAttribute("aria-label")).toBe("Закрыть");
    expect(btn.getAttribute("title")).toBe("Закрыть");
    expect(btn.className).toBe("btn btn--secondary btn--sm btn--icon");
    expect(btn.querySelector(".btn-content")?.textContent).toBe("✕");

    // Compile-time check: IconButton without label must fail typechecking.
    const verifyMissingLabelFails = () => {
      // @ts-expect-error label is required on IconButton
      return createElement(IconButton, { icon: createElement("span", null, "✕") });
    };
    expect(typeof verifyMissingLabelFails).toBe("function");
  });
});

describe("ButtonLink", () => {
  it("renders a link styled with button classes and prevents navigation when disabled or loading", () => {
    const onClick = vi.fn();
    const host = renderNode(
      createElement(
        "div",
        null,
        createElement(ButtonLink, { href: "/venues", variant: "primary", size: "lg" }, "Catalog"),
        createElement(
          ButtonLink,
          { href: "/book", variant: "danger-outline", disabled: true, onClick },
          "Blocked link",
        ),
      ),
    );
    const links = host.querySelectorAll("a");
    expect(links[0].getAttribute("href")).toBe("/venues");
    expect(links[0].className).toBe("btn btn--primary btn--lg");
    expect(links[0].getAttribute("aria-disabled")).toBeNull();

    expect(links[1].getAttribute("aria-disabled")).toBe("true");
    expect(links[1].tabIndex).toBe(-1);
    act(() => {
      links[1].click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("buttons.css tokens & variant rules", () => {
  const css = readFileSync(resolve(__dirname, "../../app/buttons.css"), "utf8");
  const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("never uses !important and keeps shimmer gold on hover", () => {
    expect(cssRules).not.toMatch(/!important/);
    const shimmerHover = cssRules.match(
      /\.btn\.btn--primary\.btn--shimmer:hover[^{]*\{([^}]+)\}/,
    )?.[1];
    expect(shimmerHover).toBeTruthy();
    expect(shimmerHover).toMatch(/background:\s*linear-gradient\(/);
    expect(shimmerHover).toContain("#e6b04b");
    expect(shimmerHover).not.toContain("--btn-primary-bg-hover");
  });

  it("gives ghost buttons a faint visible edge at rest in every surface token block", () => {
    const borderMatches = Array.from(css.matchAll(/--btn-ghost-border:\s*([^;]+);/g)).map(
      (m) => m[1].trim(),
    );
    expect(borderMatches.length).toBeGreaterThanOrEqual(3);
    for (const val of borderMatches) {
      expect(val).not.toBe("transparent");
    }
  });
});
