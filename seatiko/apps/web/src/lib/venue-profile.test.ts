// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { VenueApplication } from "./api";
import {
  applyPatch,
  clearStoredEdits,
  completenessErrors,
  diffValues,
  draftChanges,
  draftFromApplication,
  draftFromLegacy,
  formatErrors,
  formatMoldovaPhone,
  guestFallbackLocale,
  hasStoredEdits,
  isDraftDirty,
  normalizeMoldovaPhone,
  normalizeWebsite,
  patchBetween,
  pointInMoldova,
  readiness,
  readStoredEdits,
  validEmail,
  valuesFromApplication,
  valuesFromDraft,
  writeStoredEdits,
} from "./venue-profile";

const app = (over: Partial<VenueApplication> = {}): VenueApplication => ({
  id: "app-1",
  owner_user_id: "u-1",
  status: "PUBLISHED",
  name: { ru: "Олива", en: "Oliva", ro: "Oliva" },
  description: { ru: "Пицца на дровах", en: "Wood-fired pizza", ro: "Pizza pe lemne" },
  address: { ru: "ул. Независимости 15A", en: "Strada Independenței 15A", ro: "Strada Independenței 15A" },
  cuisine: ["italian", "pizza"],
  venue_type: "pizzeria",
  phone: "+373 69 987 654",
  email: "hello@oliva.md",
  website: "",
  city_id: "city-balti",
  lat: 47.761273,
  lng: 27.928449,
  price_level: 2,
  average_check: 280,
  photo_urls: ["/media/1.jpg"],
  hours_text: "Пн–Вс 10:00–23:00",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-20T10:00:00Z",
  ...over,
});

afterEach(() => localStorage.clear());

describe("normalizeMoldovaPhone / formatMoldovaPhone", () => {
  it("accepts the usual spellings of a Moldovan number", () => {
    for (const input of ["+373 69 987 654", "+37369987654", "069987654", "069 987 654", "37369987654", "0037369987654", "69987654", "(069) 98-76-54"]) {
      expect(normalizeMoldovaPhone(input)).toBe("+37369987654");
    }
    expect(normalizeMoldovaPhone("0231 2 34 56")).toBe("+37323123456");
    expect(normalizeMoldovaPhone("+373 22 123 456")).toBe("+37322123456");
  });

  it("rejects other numbers", () => {
    for (const input of ["", "12345", "+40 712 345 678", "+373 69 987 65", "+373 69 987 6543", "069987654 ext 2", "0012345678", "+373 09 987 654", "69+987654"]) {
      expect(normalizeMoldovaPhone(input)).toBeNull();
    }
  });

  it("formats mobile, Chișinău and regional numbers", () => {
    expect(formatMoldovaPhone("069987654")).toBe("+373 69 987 654");
    expect(formatMoldovaPhone("+37378123456")).toBe("+373 78 123 456");
    expect(formatMoldovaPhone("022 123 456")).toBe("+373 22 123 456");
    expect(formatMoldovaPhone("0231 2 34 56")).toBe("+373 231 23 456");
    expect(formatMoldovaPhone(" not a phone ")).toBe("not a phone");
  });
});

describe("normalizeWebsite", () => {
  it("adds https and keeps paths", () => {
    expect(normalizeWebsite("restaurant.md")).toBe("https://restaurant.md");
    expect(normalizeWebsite("www.oliva.md")).toBe("https://www.oliva.md");
    expect(normalizeWebsite("http://oliva.md")).toBe("http://oliva.md");
    expect(normalizeWebsite("https://laplacinte.md/")).toBe("https://laplacinte.md/");
    expect(normalizeWebsite("instagram.com/oliva.balti")).toBe("https://instagram.com/oliva.balti");
    expect(normalizeWebsite("  ")).toBe("");
  });

  it("rejects what is not a web address", () => {
    for (const input of ["oliva", "ftp://oliva.md", "https://", "oliva .md", "mailto:a@b.md", "http://localhost", "https://oliva.", "https://192.168.0.1"]) {
      expect(normalizeWebsite(input)).toBeNull();
    }
  });
});

describe("validEmail / pointInMoldova", () => {
  it("checks emails like the API", () => {
    expect(validEmail("hello@oliva.md")).toBe(true);
    expect(validEmail(" hello@oliva.md ")).toBe(true);
    expect(validEmail("hello@oliva")).toBe(false);
    expect(validEmail("hello oliva@x.md")).toBe(false);
    expect(validEmail("hello@oliva.m")).toBe(false);
  });

  it("knows the Moldova box", () => {
    expect(pointInMoldova(47.76, 27.93)).toBe(true);
    expect(pointInMoldova(0, 0)).toBe(false);
    expect(pointInMoldova(44.4, 26.1)).toBe(false);
  });
});

describe("values, diff and patch", () => {
  it("an untouched draft has no changes, even with unformatted saved values", () => {
    const saved = app({ phone: "+37369987654", website: "http://oliva.md", lat: 47.7612734567, name: { ru: "Олива ", en: "Oliva", ro: "Oliva" } });
    const draft = draftFromApplication(saved);
    expect(draft.phone).toBe("+373 69 987 654");
    expect(isDraftDirty(saved, draft)).toBe(false);
    expect(draft.lat).toBe("47.761273");
  });

  it("a new application is not dirty and has no price level yet", () => {
    const fresh = app({ status: "DRAFT", name: { ru: "", en: "", ro: "" }, price_level: 0, average_check: 0, lat: 0, lng: 0, cuisine: [], hours_text: "", phone: "", email: "" });
    const draft = draftFromApplication(fresh);
    expect(draft.price_level).toBe("");
    expect(draft.lat).toBe("");
    expect(isDraftDirty(fresh, draft)).toBe(false);
  });

  it("sends one language without losing the others", () => {
    const saved = app();
    const draft = draftFromApplication(saved);
    draft.description = { ...draft.description, en: "Wood-fired pizza and pasta" };
    expect(draftChanges(saved, draft)).toEqual([{ field: "description", locale: "en" }]);
    expect(patchBetween(valuesFromApplication(saved), valuesFromDraft(draft))).toEqual({
      description: { ru: "Пицца на дровах", en: "Wood-fired pizza and pasta", ro: "Pizza pe lemne" },
    });
  });

  it("lists changes in the form's order and builds a minimal patch", () => {
    const saved = app();
    const draft = draftFromApplication(saved);
    draft.average_check = "300";
    draft.phone = "069 111 222";
    draft.lat = "47,7701";
    draft.address = { ...draft.address, ru: "ул. Пушкина 1" };
    draft.cuisine = ["pizza", "italian"];
    draft.hours_text = "Пн выходной, Вт–Вс 10:00–23:00";
    const before = valuesFromApplication(saved);
    const after = valuesFromDraft(draft);
    expect(diffValues(before, after)).toEqual([
      { field: "cuisine" },
      { field: "hours_text" },
      { field: "address", locale: "ru" },
      { field: "point" },
      { field: "phone" },
      { field: "average_check" },
    ]);
    expect(patchBetween(before, after)).toEqual({
      cuisine: ["pizza", "italian"],
      hours_text: "Пн выходной, Вт–Вс 10:00–23:00",
      address: { ru: "ул. Пушкина 1", en: "Strada Independenței 15A", ro: "Strada Independenței 15A" },
      lat: 47.7701,
      lng: 27.928449,
      phone: "+373 69 111 222",
      average_check: 300,
    });
  });

  it("applies a pending request like the API to show what it changes", () => {
    const saved = valuesFromApplication(app());
    const next = applyPatch(saved, { phone: "+37322777888", website: "laplacinte.md", hours_text: "Пн–Вс 09:00–23:00" });
    expect(diffValues(saved, next)).toEqual([{ field: "hours_text" }, { field: "phone" }, { field: "website" }]);
    expect(next.phone).toBe("+373 22 777 888");
    expect(next.website).toBe("https://laplacinte.md");
    expect(diffValues(saved, applyPatch(saved, { phone: "+373 69 987 654" }))).toEqual([]);
  });
});

describe("checks", () => {
  it("flags wrong formats but not empty fields of a draft", () => {
    const draft = draftFromApplication(app({ phone: "", email: "", lat: 0, lng: 0 }));
    expect(formatErrors(draft)).toEqual({});
    draft.phone = "12345";
    draft.email = "hello@";
    draft.website = "oliva";
    draft.average_check = "12.5";
    draft.lat = "44.1";
    draft.lng = "26.1";
    expect(formatErrors(draft)).toEqual({ phone: "invalid", email: "invalid", website: "invalid", average_check: "invalid", point: "outside" });
    draft.lat = "abc";
    expect(formatErrors(draft).point).toBe("invalid");
  });

  it("lists everything missing before moderation", () => {
    const empty = draftFromApplication(app({ status: "DRAFT", name: { ru: "", en: "", ro: "" }, description: { ru: "", en: "", ro: "" }, address: { ru: "", en: "", ro: "" }, cuisine: [], hours_text: "", phone: "", email: "", lat: 0, lng: 0 }));
    expect(completenessErrors(empty, 0)).toEqual({
      name: "required",
      description: "required",
      address: "required",
      cuisine: "required",
      hours: "required",
      point: "required",
      phone: "required",
      email: "required",
      photos: "required",
    });
    expect(completenessErrors(draftFromApplication(app()), 1)).toEqual({});
  });

  it("a text in any one language is enough", () => {
    const draft = draftFromApplication(app({ name: { ru: "", en: "Oliva", ro: "" } }));
    expect(completenessErrors(draft, 1).name).toBeUndefined();
  });

  it("readiness follows the API rules", () => {
    expect(readiness(valuesFromApplication(app()), 1)).toEqual({ basics: true, address: true, point: true, cuisine: true, contacts: true, hours: true, photos: true });
    const bad = readiness(valuesFromApplication(app({ lat: 1, lng: 1, email: "nope" })), 0);
    expect(bad.point).toBe(false);
    expect(bad.contacts).toBe(false);
    expect(bad.photos).toBe(false);
  });

  it("knows which language guests fall back to", () => {
    expect(guestFallbackLocale({ ru: "Олива", en: "", ro: "" }, "ro")).toBe("ru");
    expect(guestFallbackLocale({ ru: "Олива", en: "Oliva", ro: "" }, "ro")).toBe("en");
    expect(guestFallbackLocale({ ru: "", en: "", ro: "" }, "ro")).toBeNull();
    expect(guestFallbackLocale({ ru: "", en: "", ro: "Oliva" }, "ro")).toBe("ro");
  });
});

describe("stored edits", () => {
  it("keeps edits until they match the saved application", () => {
    const saved = app({ status: "DRAFT" });
    const draft = draftFromApplication(saved);
    draft.average_check = "350";
    writeStoredEdits(saved.id, { draft, mode: "draft", saved_at: 1 });
    expect(readStoredEdits(saved, "ru")?.draft.average_check).toBe("350");
    expect(hasStoredEdits(saved, "ru")).toBe(true);
    expect(readStoredEdits(app({ status: "DRAFT", average_check: 350 }), "ru")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("drops edits that no longer fit the status", () => {
    const saved = app({ status: "DRAFT" });
    const draft = draftFromApplication(saved);
    draft.phone = "069 000 111";
    writeStoredEdits(saved.id, { draft, mode: "draft", saved_at: 1 });
    expect(readStoredEdits(app({ status: "SUBMITTED" }), "ru")).toBeNull();
  });

  it("converts the old cabinet's local 'sent to moderation' copy into unsent edits", () => {
    const saved = app();
    localStorage.setItem(
      "seatiko_venue_pending_changes:app-1",
      JSON.stringify({ name: "Oliva", description: "Pizza and pasta", address: "Strada Independenței 15A", cuisine: "italian, pizza", phone: "+373 69 987 654", email: "hello@oliva.md", website: "", hours_text: "Пн–Вс 10:00–23:00", lat: "47.761273", lng: "27.928449", price_level: "2", average_check: "280", city_id: "city-balti", venue_type: "pizzeria" }),
    );
    localStorage.setItem("seatiko:restaurant-draft:app-1", "{}");
    expect(hasStoredEdits(saved, "en")).toBe(true);
    const edits = readStoredEdits(saved, "en");
    expect(edits?.mode).toBe("change");
    expect(edits?.legacy_unsent).toBe(true);
    expect(edits?.draft.description).toEqual({ ru: "Пицца на дровах", en: "Pizza and pasta", ro: "Pizza pe lemne" });
    expect(localStorage.getItem("seatiko_venue_pending_changes:app-1")).toBeNull();
    expect(localStorage.getItem("seatiko:restaurant-draft:app-1")).toBeNull();
    // Converted once, then read from the new key.
    expect(readStoredEdits(saved, "ru")?.legacy_unsent).toBe(true);
    clearStoredEdits(saved.id);
    expect(readStoredEdits(saved, "ru")).toBeNull();
  });

  it("drops an old copy that only repeats the saved data", () => {
    const saved = app({ status: "DRAFT" });
    localStorage.setItem("seatiko:restaurant-draft:app-1", JSON.stringify({ name: "Олива", description: "Пицца на дровах", cuisine: "italian, pizza", lat: "47.761273", lng: "27.928449" }));
    expect(readStoredEdits(saved, "ru")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("puts an old one-language edit into the viewer's language only", () => {
    const draft = draftFromLegacy(app(), { name: "Oliva Pizzeria" }, "ro");
    expect(draft.name).toEqual({ ru: "Олива", en: "Oliva", ro: "Oliva Pizzeria" });
  });
});
