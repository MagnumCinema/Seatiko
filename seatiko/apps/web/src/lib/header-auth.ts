export type HeaderAuthLink = {
  href: "/login" | "/account" | "/cabinet" | "/staff" | "/admin";
  kind: "login" | "account" | "cabinet" | "staff" | "admin";
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

/** Sign-in when logged out; role-aware landing when logged in (replaces the sign-in slot). */
export function headerAuthLink(
  isAuthenticated: boolean,
  role?: string | null,
): HeaderAuthLink {
  if (!isAuthenticated) {
    return { href: "/login", kind: "login" };
  }
  if (role === "restaurant") {
    return { href: "/cabinet", kind: "cabinet" };
  }
  if (role === "staff") {
    return { href: "/staff", kind: "staff" };
  }
  return { href: "/account", kind: "account" };
}
