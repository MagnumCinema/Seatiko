// One-line label check: buttons, chips, tabs, field labels and the new floor / popup labels must not
// wrap at 360–1440 px in RU / EN / RO, on / and /venues/[id] with every popup open.
// PLAYWRIGHT_DIR=/path/with/playwright E2E_BASE_URL=http://localhost:3000 node e2e/wrap-check.e2e.mjs [out.json]
import { writeFileSync } from "node:fs";
import { BASE, launch, newPage } from "./lib.mjs";

const WIDTHS = (process.env.WRAP_WIDTHS || "360,390,768,1024,1280,1440").split(",").map(Number);
const LOCALES = (process.env.WRAP_LOCALES || "ru,en,ro").split(",");
const BOOKABLE = process.env.E2E_VENUE || "venue-12";
const WITH_OCCUPIED = process.env.E2E_VENUE_OCCUPIED || "venue-1";
const NO_TABLES = process.env.E2E_VENUE_EMPTY || "venue-9";

/** Text that must stay on one line. */
const ONE_LINE = [
  ".btn",
  ".chip",
  ".seg-item",
  // A label that wraps a control stacks them on purpose; only plain text labels count.
  "label:not(:has(input, button, select, textarea, [role='listbox']))",
  ".booking-field-label",
  ".booking-slot-period-label",
  ".mshell-kicker",
  ".mshell-step",
  // Long document names in the legal dialog are headings and may take two lines.
  ".mshell:not(.legal-modal) .mshell-title",
  ".mshell:not(.legal-modal) .mshell-foot-summary",
  ".event-preset-text strong",
  ".event-preset-text small",
  ".event-method strong",
  ".day-picker-wd",
  ".day-picker-cal-head strong",
  ".dcal-title",
  ".dcal-hour",
  ".dcal-band-label",
  ".dcal-block-time",
  ".dcal-now span",
  ".dcal-hint",
  ".bench-legend span",
  ".bench-hint",
  ".bench-zoom-btn",
  ".insp-head h3",
  ".insp-tiles dt",
  ".insp-tiles dd",
  ".fa-floor-tip-status",
  ".venue-tile-name",
  ".waitlist-collapsed-badge",
  ".legal-modal-tab",
  // Location block (home map look): badge, open status, hours label.
  ".vmap-badge",
  ".vmap-selected-status span",
  ".vloc-hours span",
].join(",");

function collect() {
  // Runs in the page.
  const selector = window.__ONE_LINE__;
  const out = { wrapped: [], clipped: [] };
  const seen = new Set();
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
  };
  for (const el of document.querySelectorAll(selector)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    if (el.closest("[aria-hidden='true'], .sr-only, [hidden]")) continue;
    // Text lines: cluster the boxes of the element's own text by vertical position.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest("[aria-hidden='true']") !== el.closest("[aria-hidden='true']")) continue;
      const ps = getComputedStyle(parent);
      if (ps.display === "none" || ps.visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push(r);
    }
    if (rects.length === 0) continue;
    rects.sort((a, b) => a.top - b.top);
    let lines = 1;
    let bottom = rects[0].bottom;
    for (const r of rects.slice(1)) {
      if (r.top >= bottom - 3) {
        lines += 1;
        bottom = r.bottom;
      } else {
        bottom = Math.max(bottom, r.bottom);
      }
    }
    const text = el.textContent.replace(/\s+/g, " ").trim().slice(0, 70);
    if (lines > 1) out.wrapped.push({ el: describe(el), text, lines });
    else if (el.scrollWidth > el.clientWidth + 1 && style.overflow !== "visible" && style.textOverflow === "ellipsis") {
      out.clipped.push({ el: describe(el), text });
    }
  }
  return out;
}

async function check(page, state, report) {
  await page.waitForTimeout(250);
  await page.evaluate((sel) => {
    window.__ONE_LINE__ = sel;
  }, ONE_LINE);
  const result = await page.evaluate(collect);
  report.push({ state, ...result });
  const tag = result.wrapped.length ? "✗" : "✓";
  console.log(`${tag} ${state}${result.wrapped.length ? `  ${result.wrapped.map((w) => `[${w.el}] “${w.text}”`).join("; ")}` : ""}`);
}

async function open(page, url, ready) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.locator(ready).first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
}

async function closeModal(page) {
  await page.keyboard.press("Escape");
  await page.locator(".mshell").first().waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
}

const browser = await launch();
const report = [];
for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    const page = await newPage(browser, { locale, width, height: width < 720 ? 844 : 900, pickerMode: "cards" });
    const at = (name) => `${locale} ${width}px ${name}`;
    try {
      await open(page, "/", ".site-header");
      await check(page, at("/"), report);
      await page.locator(".footer-legal-btn").first().click();
      await page.locator(".mshell.legal-modal").waitFor();
      await check(page, at("/ legal documents"), report);
      await closeModal(page);

      await open(page, `/venues/${BOOKABLE}`, ".venue-action-bar");
      await check(page, at("/venues (bookable)"), report);
      await page.locator(".venue-action-bar .venue-action-main").first().click();
      await page.locator(".mshell.booking-modal").waitFor();
      await check(page, at("quick booking · cards"), report);
      await page.locator(".day-picker-mode .seg-item").nth(1).click();
      await check(page, at("quick booking · calendar"), report);
      await page.locator(".bk-cta").click();
      await page.locator(".bk-slot-pill").waitFor();
      await check(page, at("quick booking · step 2 sign-in"), report);
      await closeModal(page);

      await page.locator(".insp-cta button").click();
      await page.locator(".mshell.booking-modal").waitFor();
      await check(page, at("table booking from the timeline"), report);
      await closeModal(page);

      await page.locator(".venue-tiles .venue-tile").nth(2).click();
      await page.locator(".mshell.event-modal").waitFor();
      await check(page, at("banquet · Custom (empty)"), report);
      await page.locator(".event-preset").nth(3).click();
      await check(page, at("banquet · preset picked"), report);
      await closeModal(page);

      await open(page, `/venues/${WITH_OCCUPIED}`, ".insp");
      const occupied = page.locator(".fa-table.occupied").first();
      if (await occupied.count()) {
        await occupied.click();
        await page.locator(".insp-state.is-occupied").waitFor();
        await check(page, at("occupied table inspector"), report);
        await page.locator(".insp-state.is-occupied .btn--ghost").click();
        await page.locator(".mshell.auth-modal").waitFor();
        await check(page, at("sign-in dialog"), report);
        await closeModal(page);
      }

      await open(page, `/venues/${NO_TABLES}`, ".venue-booking-soon");
      await check(page, at("/venues (no tables)"), report);
    } catch (error) {
      report.push({ state: at("ERROR"), error: String(error?.message ?? error) });
      console.log(`! ${at("error")}: ${String(error?.message ?? error).split("\n")[0]}`);
    }
    await page.context().close();
  }
}
await browser.close();

const failed = report.filter((r) => r.error || r.wrapped?.length);
const clipped = report.reduce((n, r) => n + (r.clipped?.length ?? 0), 0);
console.log(`\n${report.length - failed.length}/${report.length} states without wrapped labels · ${clipped} ellipsis-clipped texts`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
