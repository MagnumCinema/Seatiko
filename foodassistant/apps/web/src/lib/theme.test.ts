// @vitest-environment happy-dom

import { describe, expect, it, beforeEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  parseTheme,
  readStoredTheme,
  writeStoredTheme,
} from "./theme";

describe("parseTheme", () => {
  it("accepts dark and light", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it("falls back to default for junk", () => {
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("sepia")).toBe(DEFAULT_THEME);
  });
});

describe("readStoredTheme / writeStoredTheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to dark when empty", () => {
    expect(readStoredTheme()).toBe("dark");
  });

  it("round-trips light", () => {
    writeStoredTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readStoredTheme()).toBe("light");
  });
});
