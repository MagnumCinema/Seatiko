import { describe, expect, it } from "vitest";
import { getSiteCopy } from "./site-copy";

/** Every key of a nested copy object, as dotted paths. */
function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => paths(item, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

describe("cabinet profile tab copy", () => {
  const ru = getSiteCopy("ru").cabinet.profileTab;

  it("has the same strings in RU, EN and RO", () => {
    for (const locale of ["en", "ro"] as const) {
      expect(paths(getSiteCopy(locale).cabinet.profileTab).sort()).toEqual(paths(ru).sort());
    }
  });

  it("keeps placeholders in every language", () => {
    for (const locale of ["ru", "en", "ro"] as const) {
      const copy = getSiteCopy(locale).cabinet.profileTab;
      expect(copy.photosPublishedNote).toContain("{email}");
      expect(copy.requestCancelHint).toContain("{email}");
      expect(copy.hoursBookingNote).toContain("{range}");
      expect(copy.langFallback).toContain("{fallback}");
      expect(copy.dayShort).toHaveLength(7);
      expect(copy.dayLong).toHaveLength(7);
      for (const form of Object.values(copy.changesCount)) expect(form).toContain("{n}");
    }
  });
});
