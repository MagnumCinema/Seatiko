export type HeaderAuthLink = {
  href: "/login" | "/account";
  kind: "login" | "account";
};

/** Same-tab signal when `setToken` changes auth state. */
export const AUTH_CHANGE_EVENT = "fa-auth-change";

/** Sign-in when logged out; profile when logged in (replaces the sign-in slot). */
export function headerAuthLink(isAuthenticated: boolean): HeaderAuthLink {
  return isAuthenticated
    ? { href: "/account", kind: "account" }
    : { href: "/login", kind: "login" };
}
