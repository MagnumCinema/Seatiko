import { describe, expect, it } from "vitest";
import { AUTH_CHANGE_EVENT, headerAuthLink, headerUserName } from "./header-auth";

describe("headerAuthLink", () => {
  it("shows sign-in when logged out", () => {
    expect(headerAuthLink(false)).toEqual({
      href: "/login",
      kind: "login",
    });
  });

  it("replaces sign-in with profile when logged in", () => {
    expect(headerAuthLink(true)).toEqual({
      href: "/account",
      kind: "account",
    });
  });

  it("exports a stable auth-change event name", () => {
    expect(AUTH_CHANGE_EVENT).toBe("fa-auth-change");
  });
});

describe("headerUserName", () => {
  it("prefers the preferred name, then first name", () => {
    expect(headerUserName({ display_name: " Кристиан ", first_name: "Cristian", email: "c@x.md" })).toBe("Кристиан");
    expect(headerUserName({ display_name: "  ", first_name: "Cristian", email: "c@x.md" })).toBe("Cristian");
  });

  it("falls back to the email login", () => {
    expect(headerUserName({ display_name: "", first_name: "", email: "guest@seatiko.local" })).toBe("guest");
    expect(headerUserName({})).toBe("");
  });
});
