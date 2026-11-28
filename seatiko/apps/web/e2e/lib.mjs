// Shared helpers for the browser checks in this folder (plain Playwright, no test runner).
// Playwright is not a dependency of the site: point PLAYWRIGHT_DIR at a folder where
// `npm i playwright` was run, e.g. PLAYWRIGHT_DIR=/tmp/pw node e2e/venue-redesign.e2e.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "noop.js") : import.meta.url,
);
export const { chromium } = require("playwright");

export const BASE = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export const messages = Object.fromEntries(
  ["ru", "en", "ro"].map((lang) => [lang, JSON.parse(readFileSync(path.join(here, "..", "messages", `${lang}.json`), "utf8"))]),
);

export async function api(pathname, { token, method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status} ${text.slice(0, 200)}`);
  return data;
}

export function uniqueEmail(tag) {
  return `e2e-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
}

/** A fresh guest account (one active booking per guest, so each flow gets its own). */
export async function registerGuest(tag, { phone } = {}) {
  const email = uniqueEmail(tag);
  const auth = await api("/api/v1/auth/register", {
    method: "POST",
    body: { email, password: "Passw0rd!e2e", first_name: "Ana", last_name: "Test", locale: "ru" },
  });
  if (phone) await api("/api/v1/me", { token: auth.token, method: "PATCH", body: { phone } });
  return { token: auth.token, email };
}

export async function launch() {
  return chromium.launch(process.env.E2E_HEADED ? { headless: false } : {});
}

export async function newPage(browser, { locale = "ru", theme = "light", token = null, width = 1440, height = 900, pickerMode = "cards" } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(
    ([lo, th, tok, mode]) => {
      if (sessionStorage.getItem("e2e-init")) return;
      sessionStorage.setItem("e2e-init", "1");
      localStorage.setItem("fa_locale", lo);
      localStorage.setItem("fa-theme", th);
      if (mode) localStorage.setItem("seatiko_date_picker_mode", mode);
      if (tok) localStorage.setItem("fa_token", tok);
      else localStorage.removeItem("fa_token");
    },
    [locale, theme, token, pickerMode],
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.errors = errors;
  return page;
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** Runs named steps, prints ✓ / ✗ and exits non-zero when any failed. */
export async function runSteps(steps) {
  const results = [];
  for (const [name, fn] of steps) {
    const started = Date.now();
    try {
      await fn();
      results.push({ name, ok: true, ms: Date.now() - started });
      console.log(`✓ ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      results.push({ name, ok: false, error: String(error?.message ?? error) });
      console.log(`✗ ${name}\n    ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0;
}
