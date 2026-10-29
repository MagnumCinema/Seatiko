import { describe, expect, it } from "vitest";
import { AUTH_CHANGE_EVENT, headerAuthLink } from "./header-auth";

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
