import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const premiumCss = readFileSync(
  resolve(__dirname, "../app/premium.css"),
  "utf8",
);

function ruleBlock(selector: string): string {
  const start = premiumCss.indexOf(`${selector} {`);
  expect(start, `missing selector ${selector}`).toBeGreaterThanOrEqual(0);
  const open = premiumCss.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < premiumCss.length; i += 1) {
    const ch = premiumCss[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return premiumCss.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed block for ${selector}`);
}

describe("discover page theme CSS", () => {
  it("uses theme tokens for page background and hero text", () => {
    const page = ruleBlock(".discover-page");
    expect(page).toMatch(/var\(--fa-bg\)/);
    expect(page).not.toMatch(/#0c110e|#152018|#0f1410/);

    const hero = ruleBlock(".discover-hero h1");
    expect(hero).toMatch(/var\(--fa-text\)/);
    expect(hero).not.toMatch(/#f7f3ea/);
  });

  it("keeps stepper and open chat on theme surfaces", () => {
    const stepper = ruleBlock(".discover-stepper");
    expect(stepper).toMatch(/var\(--fa-surface/);
    expect(stepper).not.toMatch(/rgba\(28,\s*42,\s*32/);

    const chatOpen = ruleBlock(".discover-chat.open");
    expect(chatOpen).toMatch(/var\(--fa-/);
    expect(chatOpen).not.toMatch(/rgba\(26,\s*38,\s*30/);
  });
});
