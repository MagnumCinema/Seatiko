// Booking, banquet, cancel/undo and floor-plan flows on /venues/[id] against a running site + API.
// PLAYWRIGHT_DIR=/path/with/playwright E2E_BASE_URL=http://localhost:3000 node e2e/venue-redesign.e2e.mjs
import { BASE, api, assert, launch, messages, newPage, registerGuest, runSteps, uniqueEmail } from "./lib.mjs";

const ru = messages.ru;
const BOOKABLE = process.env.E2E_VENUE || "venue-12";
const WITH_OCCUPIED = process.env.E2E_VENUE_OCCUPIED || "venue-1";
const NO_TABLES = process.env.E2E_VENUE_EMPTY || "venue-9";

const browser = await launch();

function hm(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function signUpInForm(scope) {
  await scope.locator('input[autocomplete="given-name"]').fill("E2E");
  await scope.locator('input[autocomplete="family-name"]').fill("Guest");
  await scope.locator('input[type="email"]').fill(uniqueEmail("inline"));
  await scope.locator('input[type="password"]').fill("Passw0rd!e2e");
  await scope.locator("form.booking-popup-auth button[type=submit]").click();
}

let loggedInBooking = null;

const ok = await runSteps([
  [
    "book via cards while logged out: step 2 sign-in keeps the slot and books it",
    async () => {
      const page = await newPage(browser, { pickerMode: "cards" });
      await page.goto(`${BASE}/venues/${BOOKABLE}`, { waitUntil: "domcontentloaded" });
      await page.locator(".venue-action-bar .venue-action-main").first().waitFor();
      await page.waitForTimeout(500);
      await page.locator(".venue-action-bar .venue-action-main").first().click();
      const modal = page.locator(".mshell.booking-modal");
      await modal.waitFor();
      assert((await page.evaluate(() => document.body.style.overflow)) === "hidden", "page behind the popup is locked");
      assert((await modal.locator(".mshell-step").textContent()).includes("1"), "step 1 of 2 shown");
      await modal.locator(".day-picker-cards .chip").nth(1).click();
      const chip = modal.locator(".booking-slot-times .chip:not([disabled])").nth(2);
      const time = (await chip.textContent()).trim();
      await chip.click();
      assert((await modal.locator(".bk-cta").textContent()).includes(time), "CTA names the picked time");
      // Optional comment, kept through the sign-in step and sent as the booking's notes.
      await modal.locator(".bk-comment").fill("У окна, день рождения");
      assert((await modal.locator(".bk-counter").textContent()).replace(/\s/g, "") === "21/300", "comment counter");
      await modal.locator(".bk-cta").click();
      await modal.locator(".bk-slot-pill").waitFor();
      assert((await modal.locator(".mshell-title").textContent()).includes(ru["booking.auth_title"]), "sign-in step title");
      assert((await modal.locator(".bk-slot-pill").textContent()).includes(time), "slot pill keeps the time");
      await signUpInForm(modal);
      await modal.locator(".booking-done").waitFor({ timeout: 20_000 });
      const token = await page.evaluate(() => localStorage.getItem("fa_token"));
      const { reservations } = await api("/api/v1/reservations", { token });
      const booked = reservations.find((r) => r.status !== "CANCELLED");
      assert(booked, "reservation created");
      assert(hm(booked.reserved_for) === time.slice(0, 5), `booked at ${time} (got ${hm(booked.reserved_for)})`);
      assert(booked.notes === "У окна, день рождения", `comment saved as notes (got ${booked.notes})`);
      assert((await modal.locator(".booking-ticket-comment").textContent()).includes("У окна"), "comment on the ticket");
      await page.keyboard.press("Escape");
      await modal.waitFor({ state: "detached" });
      assert((await page.evaluate(() => document.body.style.overflow)) !== "hidden", "scroll unlocked after close");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.context().close();
    },
  ],
  [
    "book via the calendar while logged in, starting from the table timeline",
    async () => {
      const guest = await registerGuest("calendar");
      const page = await newPage(browser, { token: guest.token, pickerMode: "cards" });
      await page.goto(`${BASE}/venues/${BOOKABLE}`, { waitUntil: "domcontentloaded" });
      await page.locator("#venue-floor").waitFor();
      await page.locator("#venue-floor").scrollIntoViewIfNeeded();
      await page.locator(".insp").waitFor();
      // Tap a free time in the vertical day calendar: it becomes the start of "Book #N · time".
      const slot = page.locator(".dcal-slot").nth(2);
      const time = (await slot.getAttribute("data-time")).trim();
      await slot.click();
      assert((await page.locator(".dcal-pick").textContent()).includes(time), "picked block drawn in the calendar");
      const cta = page.locator(".insp-cta button");
      assert((await cta.textContent()).includes(time), "inspector CTA names the picked time");
      await cta.click();
      const modal = page.locator(".mshell.booking-modal");
      await modal.waitFor();
      assert((await modal.locator(".mshell-step").count()) === 0, "no step pill when signed in");
      assert((await modal.locator(".bk-cta").textContent()).includes(time), "popup opens on the timeline time");
      await modal.locator(".day-picker-mode .seg-item").nth(1).click();
      await modal.locator(".day-picker-grid").waitFor();
      assert((await page.evaluate(() => localStorage.getItem("seatiko_date_picker_mode"))) === "calendar", "mode remembered");
      const weekLabel = modal.locator(".day-picker-cal-head strong");
      const firstWeek = await weekLabel.textContent();
      assert(await modal.locator(`.day-picker-cal-head button[aria-label="${ru["picker.prev_week"]}"]`).isDisabled(), "no weeks before today");
      await modal.locator(`.day-picker-cal-head button[aria-label="${ru["picker.next_week"]}"]`).click();
      assert((await weekLabel.textContent()) !== firstWeek, "week label follows the arrows");
      assert(await modal.locator(`.day-picker-cal-head button[aria-label="${ru["picker.next_week"]}"]`).isDisabled(), "no weeks past the booking window");
      await modal.locator(".day-picker-cell:not([disabled])").nth(1).click();
      await modal.locator(".booking-slot-times .chip:not([disabled])").first().click();
      await modal.locator(".bk-cta").click();
      await modal.locator(".booking-done").waitFor({ timeout: 20_000 });
      const { reservations } = await api("/api/v1/reservations", { token: guest.token });
      const booked = reservations.find((r) => r.status !== "CANCELLED");
      assert(booked, "reservation created");
      loggedInBooking = { page, modal, token: guest.token, id: booked.id };
    },
  ],
  [
    "cancel asks first, then 'Undo' keeps the booking",
    async () => {
      assert(loggedInBooking, "needs the previous booking");
      const { page, modal, token, id } = loggedInBooking;
      await modal.locator(".booking-done-cancel").click();
      const dialog = page.locator('[role="alertdialog"]');
      await dialog.waitFor();
      await dialog.locator(".btn--danger").click();
      await dialog.waitFor({ state: "detached" });
      const toast = page.locator(".toast", { hasText: ru["booking.cancelled_toast"] });
      await toast.waitFor();
      await toast.locator(".toast-action").click();
      await page.locator(".toast", { hasText: ru["booking.restored_toast"] }).waitFor();
      await page.waitForTimeout(7_000);
      const { reservations } = await api("/api/v1/reservations", { token });
      assert(reservations.find((r) => r.id === id)?.status !== "CANCELLED", "booking kept after Undo");
    },
  ],
  [
    "cancel without Undo goes through when the toast runs out",
    async () => {
      const { page, modal, token, id } = loggedInBooking;
      await modal.locator(".booking-done-cancel").click();
      await page.locator('[role="alertdialog"] .btn--danger').click();
      await page.locator(".toast", { hasText: ru["booking.cancelled_toast"] }).waitFor();
      await page.waitForTimeout(7_500);
      const { reservations } = await api("/api/v1/reservations", { token });
      assert(reservations.find((r) => r.id === id)?.status === "CANCELLED", "booking cancelled");
      await page.context().close();
    },
  ],
  [
    "banquet with a preset: Custom first and empty, presets fill, Custom restores, contacts prefilled",
    async () => {
      const guest = await registerGuest("banquet", { phone: "+37379000111" });
      const page = await newPage(browser, { token: guest.token, pickerMode: "cards" });
      await page.goto(`${BASE}/venues/${BOOKABLE}`, { waitUntil: "domcontentloaded" });
      await page.locator(".venue-tiles .venue-tile").nth(2).waitFor();
      await page.waitForTimeout(500);
      await page.locator(".venue-tiles .venue-tile").nth(2).click();
      const modal = page.locator(".mshell.event-modal");
      await modal.waitFor();
      const checked = modal.locator('.event-preset[aria-checked="true"]');
      assert((await checked.textContent()).includes(ru["banquet.preset_custom"]), "Custom selected by default");
      assert((await modal.locator("#event-guests").inputValue()) === "", "guests empty by default");
      assert((await modal.locator("#event-notes").inputValue()) === "", "wishes empty by default");
      await modal.locator(".event-preset", { hasText: ru["banquet.preset_birthday"] }).click();
      assert((await modal.locator("#event-guests").inputValue()) === "12", "birthday fills 12 guests");
      assert((await modal.locator("#event-notes").inputValue()).length > 10, "birthday fills wishes");
      await modal.locator(".event-preset", { hasText: ru["banquet.preset_custom"] }).click();
      assert((await modal.locator("#event-guests").inputValue()) === "", "Custom brings back the empty form");
      await modal.locator(".event-preset", { hasText: ru["banquet.preset_corporate"] }).click();
      assert((await modal.locator("#event-guests").inputValue()) === "25", "corporate fills 25 guests");
      assert((await modal.locator("#event-contact-name").inputValue()) === "Ana Test", "name from the account");
      assert((await modal.locator("#event-contact-phone").inputValue()) === "+37379000111", "phone from the account");
      await modal.locator(".day-picker-cards .chip:not([disabled])").nth(2).click();
      await modal.locator('button[type="submit"]').click();
      await modal.locator(".event-success-lead").waitFor({ timeout: 20_000 });
      const { inquiries } = await api("/api/v1/event-inquiries", { token: guest.token });
      const sent = inquiries[0];
      assert(sent.guest_count === 25 && sent.event_type === "corporate", `sent corporate for 25 (${sent.event_type}/${sent.guest_count})`);
      assert(new Date(sent.preferred_date).getHours() === 18, "preset start time 18:00");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.context().close();
    },
  ],
  [
    "banquet with Custom while logged out: calendar date, time chip, inline sign-in keeps everything",
    async () => {
      const page = await newPage(browser, { pickerMode: "calendar" });
      await page.goto(`${BASE}/venues/${BOOKABLE}`, { waitUntil: "domcontentloaded" });
      await page.locator(".venue-tiles .venue-tile").nth(2).waitFor();
      await page.waitForTimeout(500);
      await page.locator(".venue-tiles .venue-tile").nth(2).click();
      const modal = page.locator(".mshell.event-modal");
      await modal.waitFor();
      await modal.locator("#event-guests").fill("7");
      // A year of dates: paged by month; go to next month and pick a day there.
      await modal.locator(`.day-picker-cal-head button[aria-label="${ru["picker.next_month"]}"]`).click();
      await modal.locator(".day-picker-cell:not([disabled])").nth(3).click();
      await modal.locator(".bk-chips .chip", { hasText: "18:00" }).click();
      await modal.locator("#event-contact-name").fill("Ion Custom");
      await modal.locator("#event-contact-phone").fill("+37369000222");
      await modal.locator("#event-notes").fill("E2E custom wishes");
      await modal.locator('button[type="submit"]').click();
      await modal.locator(".bk-slot-pill").waitFor();
      await signUpInForm(modal);
      await modal.locator(".event-success-lead").waitFor({ timeout: 20_000 });
      const token = await page.evaluate(() => localStorage.getItem("fa_token"));
      const { inquiries } = await api("/api/v1/event-inquiries", { token });
      const sent = inquiries[0];
      assert(sent.guest_count === 7 && sent.event_type === "other", `sent custom for 7 (${sent.event_type}/${sent.guest_count})`);
      assert(sent.notes.includes("E2E custom wishes") && sent.contact_name === "Ion Custom", "typed values kept");
      await page.context().close();
    },
  ],
  [
    "venue without tables: no hall outline, 'online booking soon' and favorite / share",
    async () => {
      const page = await newPage(browser);
      await page.goto(`${BASE}/venues/${NO_TABLES}`, { waitUntil: "domcontentloaded" });
      await page.locator(".venue-booking-soon").waitFor();
      assert((await page.locator("#venue-floor").count()) === 0, "no floor section");
      assert((await page.locator(".hall-frame").count()) === 0, "no empty hall");
      assert((await page.locator(".venue-action-bar.is-icons .btn").count()) === 2, "favorite + share");
      await page.context().close();
    },
  ],
  [
    "occupied table: next free window, switch to a free table, notify asks to sign in",
    async () => {
      const page = await newPage(browser);
      await page.goto(`${BASE}/venues/${WITH_OCCUPIED}`, { waitUntil: "domcontentloaded" });
      await page.locator("#venue-floor").waitFor();
      await page.locator("#venue-floor").scrollIntoViewIfNeeded();
      const occupied = page.locator(".fa-table.occupied").first();
      assert((await occupied.count()) > 0, "the demo venue has an occupied table");
      await occupied.click();
      const state = page.locator(".insp-state.is-occupied");
      await state.waitFor();
      assert((await page.locator(".insp-cta button").textContent()).length > 0, "booking CTA for a later time");
      await state.locator(".btn--ghost").click();
      const auth = page.locator(".mshell.auth-modal");
      await auth.waitFor();
      await page.keyboard.press("Escape");
      await auth.waitFor({ state: "detached" });
      const before = await page.locator(".insp-head h3").textContent();
      await state.locator(".btn--secondary").click();
      await page.locator(".insp.is-free").waitFor();
      assert((await page.locator(".insp-head h3").textContent()) !== before, "switched to another table");
      await page.context().close();
    },
  ],
]);

await browser.close();
process.exit(ok ? 0 : 1);
