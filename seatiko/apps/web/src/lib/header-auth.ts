export type HeaderAuthLink = {
  href: "/login" | "/account";
  kind: "login" | "account";
};

/** Same-tab signal when `setToken` changes auth state. */
export const AUTH_CHANGE_EVENT = "fa-auth-change";

/** Same-tab signal when the signed-in user's profile (e.g. name) was saved. */
export const PROFILE_CHANGE_EVENT = "fa-profile-change";

/** Name for the header account button: preferred name, then first name, then email login. */
export function headerUserName(user: {
  display_name?: string | null;
  first_name?: string | null;
  email?: string | null;
}): string {
  const preferred = user.display_name?.trim() || user.first_name?.trim();
  if (preferred) return preferred;
  return user.email?.split("@")[0]?.trim() ?? "";
}

/** Sign-in when logged out; profile when logged in (replaces the sign-in slot). */
export function headerAuthLink(isAuthenticated: boolean): HeaderAuthLink {
  return isAuthenticated
    ? { href: "/account", kind: "account" }
    : { href: "/login", kind: "login" };
}
