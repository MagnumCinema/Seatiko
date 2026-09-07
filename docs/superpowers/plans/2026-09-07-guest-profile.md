# Guest Personal Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared guest profile UI on `/account` and the app-shell Profile tab (identity via API, local favorites/allergies, payment + 18+ stubs) plus site-wide dark/light theme.

**Architecture:** Pure helpers for theme and local prefs (TDD). `ThemeProvider` sets `html[data-theme]`. `GuestProfile` is the single profile UI mounted by `/account` and app-shell. CSS variables in `premium.css` / layout replace hard-coded light auth chrome.

**Tech Stack:** Next.js App Router, React 19, TypeScript, existing `fetchMe`/`updateMe`/`getToken`, Vitest, RU/EN/RO messages + `site-copy` where needed.

**Spec:** `docs/superpowers/specs/2026-09-07-guest-profile-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `foodassistant/apps/web/src/lib/theme.ts` | Theme type, storage key, read/write, apply to `documentElement` |
| `foodassistant/apps/web/src/lib/theme.test.ts` | Unit tests for theme helpers |
| `foodassistant/apps/web/src/components/theme-provider.tsx` | React context + hydrate from `localStorage` |
| `foodassistant/apps/web/src/lib/guest-local-prefs.ts` | Allergies + favorites scoped by `userId` |
| `foodassistant/apps/web/src/lib/guest-local-prefs.test.ts` | Unit tests for local prefs |
| `foodassistant/apps/web/src/components/guest-profile.tsx` | Shared profile UI + nested panels |
| `foodassistant/apps/web/src/app/account/page.tsx` | `/account` route with header + auth gate |
| `foodassistant/apps/web/src/components/site-header.tsx` | Account link + theme toggle |
| `foodassistant/apps/web/src/components/app-shell.tsx` | Profile tab mounts `GuestProfile` |
| `foodassistant/apps/web/src/app/layout.tsx` | Wrap `ThemeProvider`; theme-aware body classes |
| `foodassistant/apps/web/src/app/premium.css` | `[data-theme]` tokens; auth + account styles |
| `foodassistant/apps/web/messages/{ru,en,ro}.json` | New `profile.*` / `theme.*` / `age18.*` keys |
| `foodassistant/README.md` | **TODO features** backlog |
| `docs/UX_SCREENS.md` / `docs/CHANGELOG.md` | Note `/account` + theme if product docs need a one-line sync |

---

### Task 1: Theme helpers (TDD)

**Files:**
- Create: `foodassistant/apps/web/src/lib/theme.ts`
- Create: `foodassistant/apps/web/src/lib/theme.test.ts`

- [ ] **Step 1: Write failing tests**

Create `foodassistant/apps/web/src/lib/theme.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  parseTheme,
  readStoredTheme,
  writeStoredTheme,
  type Theme,
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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd foodassistant/apps/web && npm test -- src/lib/theme.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `theme.ts`**

```ts
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "fa-theme";
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

export function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeStoredTheme(theme: Theme): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd foodassistant/apps/web && npm test -- src/lib/theme.test.ts
```

Expected: PASS. (If Vitest lacks `localStorage`, set `environment: "happy-dom"` or `"jsdom"` in `vitest.config.ts` for these tests, or mock `globalThis.localStorage` in the test file.)

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/lib/theme.ts foodassistant/apps/web/src/lib/theme.test.ts foodassistant/apps/web/vitest.config.ts
git commit -m "feat(web): add theme storage helpers with tests"
```

---

### Task 2: ThemeProvider + CSS tokens + layout

**Files:**
- Create: `foodassistant/apps/web/src/components/theme-provider.tsx`
- Modify: `foodassistant/apps/web/src/app/layout.tsx`
- Modify: `foodassistant/apps/web/src/app/premium.css` (top of file: theme tokens)
- Modify: `foodassistant/apps/web/messages/ru.json`, `en.json`, `ro.json`

- [ ] **Step 1: Add i18n keys**

In each of `messages/ru.json`, `en.json`, `ro.json` add:

```json
"theme.toggle": "Theme",
"theme.dark": "Dark",
"theme.light": "Light"
```

(RU/RO equivalents: «Тема» / «Тёмная» / «Светлая»; «Temă» / «Întunecat» / «Deschis».)

- [ ] **Step 2: Implement `ThemeProvider`**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  readStoredTheme,
  writeStoredTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const stored = readStoredTheme();
    queueMicrotask(() => {
      setThemeState(stored);
      applyThemeToDocument(stored);
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeStoredTheme(next);
    applyThemeToDocument(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme requires ThemeProvider");
  return ctx;
}
```

- [ ] **Step 3: Wrap layout**

In `layout.tsx`, nest providers:

```tsx
<html lang="ru" className={...} data-theme="dark">
  <body className="min-h-full flex flex-col antialiased site-body">
    <LocaleProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </LocaleProvider>
  </body>
</html>
```

Remove hard-coded `bg-[#0f1410] text-[#f3efe6]` from `body` (move to `.site-body` / theme tokens).

- [ ] **Step 4: Add CSS variables at top of `premium.css`**

```css
html[data-theme="dark"] {
  color-scheme: dark;
  --site-bg: #0f1410;
  --site-fg: #f3efe6;
  --site-muted: #9aa89a;
  --site-surface: rgba(255, 255, 255, 0.045);
  --site-border: rgba(255, 255, 255, 0.12);
  --site-accent: #e9b96e;
  --auth-card-bg: rgba(18, 46, 36, 0.96);
  --auth-card-fg: #f3efe6;
  --auth-card-muted: #9aa89a;
}

html[data-theme="light"] {
  color-scheme: light;
  --site-bg: #f4f0e8;
  --site-fg: #1a2420;
  --site-muted: #5c6b63;
  --site-surface: #fffaf2;
  --site-border: rgba(26, 36, 32, 0.12);
  --site-accent: #246046;
  --auth-card-bg: #fffaf2;
  --auth-card-fg: #1a2420;
  --auth-card-muted: #6c7871;
}

.site-body {
  background: var(--site-bg);
  color: var(--site-fg);
}
```

Update `.auth-page` / `.auth-card` (and owner-register card) to use `var(--auth-card-*)` instead of fixed cream-only colors where they force light-on-light mismatch. Keep readable contrast in both themes.

- [ ] **Step 5: Manual smoke**

```bash
cd foodassistant/apps/web && npm run dev
```

Open `/` and `/login`; in DevTools set `document.documentElement.dataset.theme = "light"` then `"dark"` — backgrounds should flip. (Header toggle comes in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add foodassistant/apps/web/src/components/theme-provider.tsx \
  foodassistant/apps/web/src/app/layout.tsx \
  foodassistant/apps/web/src/app/premium.css \
  foodassistant/apps/web/messages/ru.json \
  foodassistant/apps/web/messages/en.json \
  foodassistant/apps/web/messages/ro.json
git commit -m "feat(web): add ThemeProvider and dark/light CSS tokens"
```

---

### Task 3: Header theme toggle + Account link

**Files:**
- Modify: `foodassistant/apps/web/src/components/site-header.tsx`

- [ ] **Step 1: Wire toggle and Account**

Import `useTheme` and `Link`. Add after language switcher (or before login):

```tsx
const { theme, toggleTheme } = useTheme();
// ...
<button
  type="button"
  className="site-theme-toggle"
  onClick={toggleTheme}
  aria-label={/* t or site-copy theme.toggle */}
>
  {theme === "dark" ? "Light" : "Dark"}
</button>
<Link href="/account">{/* Account / Профиль */}</Link>
```

Use `getSiteCopy(locale).header` — extend `site-copy.ts` with `account` and reuse message keys if the header already uses `site-copy`. Prefer consistency with existing header pattern (`getSiteCopy`).

Add minimal `.site-theme-toggle` styles in `premium.css` using theme tokens.

- [ ] **Step 2: Smoke**

Toggle on `/` and `/login`; preference survives refresh (`localStorage fa-theme`).

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/components/site-header.tsx \
  foodassistant/apps/web/src/lib/site-copy.ts \
  foodassistant/apps/web/src/app/premium.css
git commit -m "feat(web): add header theme toggle and Account link"
```

---

### Task 4: Guest local prefs (TDD)

**Files:**
- Create: `foodassistant/apps/web/src/lib/guest-local-prefs.ts`
- Create: `foodassistant/apps/web/src/lib/guest-local-prefs.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  loadGuestLocalPrefs,
  saveGuestLocalPrefs,
  addFavoriteVenue,
  removeFavoriteVenue,
  emptyGuestLocalPrefs,
  type GuestLocalPrefs,
} from "./guest-local-prefs";

const USER = "user-1";

describe("guest-local-prefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty prefs when missing", () => {
    expect(loadGuestLocalPrefs(USER)).toEqual(emptyGuestLocalPrefs());
  });

  it("round-trips allergies", () => {
    const prefs: GuestLocalPrefs = {
      allergies: "gluten, lactose",
      favorites: [],
    };
    saveGuestLocalPrefs(USER, prefs);
    expect(loadGuestLocalPrefs(USER).allergies).toBe("gluten, lactose");
  });

  it("scopes by user id", () => {
    saveGuestLocalPrefs("a", { allergies: "nuts", favorites: [] });
    expect(loadGuestLocalPrefs("b").allergies).toBe("");
  });

  it("adds and removes favorites without duplicates", () => {
    let prefs = emptyGuestLocalPrefs();
    prefs = addFavoriteVenue(prefs, {
      venueId: "v1",
      name: "Cafe One",
    });
    prefs = addFavoriteVenue(prefs, {
      venueId: "v1",
      name: "Cafe One",
    });
    expect(prefs.favorites).toHaveLength(1);
    prefs = removeFavoriteVenue(prefs, "v1");
    expect(prefs.favorites).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd foodassistant/apps/web && npm test -- src/lib/guest-local-prefs.test.ts
```

- [ ] **Step 3: Implement**

```ts
export type FavoriteVenue = {
  venueId: string;
  name: string;
};

export type GuestLocalPrefs = {
  allergies: string;
  favorites: FavoriteVenue[];
};

const PREFIX = "fa-guest-prefs:";

export function emptyGuestLocalPrefs(): GuestLocalPrefs {
  return { allergies: "", favorites: [] };
}

export function storageKeyForUser(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function loadGuestLocalPrefs(userId: string): GuestLocalPrefs {
  if (typeof localStorage === "undefined") return emptyGuestLocalPrefs();
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return emptyGuestLocalPrefs();
    const parsed = JSON.parse(raw) as Partial<GuestLocalPrefs>;
    return {
      allergies: typeof parsed.allergies === "string" ? parsed.allergies : "",
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter(
            (f): f is FavoriteVenue =>
              !!f &&
              typeof f.venueId === "string" &&
              typeof f.name === "string",
          )
        : [],
    };
  } catch {
    return emptyGuestLocalPrefs();
  }
}

export function saveGuestLocalPrefs(
  userId: string,
  prefs: GuestLocalPrefs,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function addFavoriteVenue(
  prefs: GuestLocalPrefs,
  favorite: FavoriteVenue,
): GuestLocalPrefs {
  if (prefs.favorites.some((f) => f.venueId === favorite.venueId)) {
    return prefs;
  }
  return { ...prefs, favorites: [...prefs.favorites, favorite] };
}

export function removeFavoriteVenue(
  prefs: GuestLocalPrefs,
  venueId: string,
): GuestLocalPrefs {
  return {
    ...prefs,
    favorites: prefs.favorites.filter((f) => f.venueId !== venueId),
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd foodassistant/apps/web && npm test -- src/lib/guest-local-prefs.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/lib/guest-local-prefs.ts \
  foodassistant/apps/web/src/lib/guest-local-prefs.test.ts
git commit -m "feat(web): add guest local prefs helper for allergies and favorites"
```

---

### Task 5: `GuestProfile` component

**Files:**
- Create: `foodassistant/apps/web/src/components/guest-profile.tsx`
- Modify: `foodassistant/apps/web/messages/{ru,en,ro}.json`
- Modify: `foodassistant/apps/web/src/app/premium.css`

- [ ] **Step 1: Add message keys**

```json
"profile.account_title": "Account",
"profile.email": "Email",
"profile.allergies_hint": "Stored on this device until sync is available",
"profile.allergies_save": "Save allergies",
"profile.payments_placeholder": "Payment methods will appear here. No card data is charged in this version.",
"profile.payments_add": "Add card (preview)",
"profile.payments_demo": "Card •••• 4242",
"profile.favorites_empty": "No favorite venues yet",
"profile.favorites_remove": "Remove",
"profile.age18": "Age 18+",
"profile.age18_unverified": "Age not verified by staff",
"profile.logout": "Log out",
"profile.save_failed": "Could not save profile"
```

(Translate RU/RO. Align `profile.age18_unverified` with `docs/I18N.md` `age18.profile_status_unverified` wording.)

- [ ] **Step 2: Implement `GuestProfile`**

Props:

```ts
type GuestProfileProps = {
  user: User | null;
  onRequestSignIn: () => void;
  onUserUpdated?: (user: User) => void;
  onLogout: () => void;
  /** optional toast; default no-op */
  onToast?: (message: string) => void;
  /** when true, omit outer page title (app-shell already has one) */
  embedded?: boolean;
};
```

Behavior:

1. If `!user` → primary button calling `onRequestSignIn`.
2. If signed in:
   - Show email (read-only).
   - Controlled draft for `first_name`, `last_name`, `display_name`; Save → `updateMe` + `onUserUpdated` + toast `profile.saved`; on error toast `profile.save_failed`.
   - Language row: call `useLocale().setLocale` and `updateMe({ locale })` (best-effort).
   - Theme row (optional duplicate of header toggle via `useTheme`).
   - Allergies: textarea bound to local prefs; Save writes `saveGuestLocalPrefs`.
   - Payments: expand panel with demo row + “Add card (preview)” that appends another placeholder in component state only (not persisted).
   - Favorites: list from local prefs; remove button; empty state. (Add-from-venue can be a later microtask: optional “Add current” only if parent passes `suggestFavorite`; v1 list + remove is enough if add happens from venue page later — for v1 also add a small “Add demo venue” only in tests OR wire venue detail heart in Task 7.)
   - Age 18+: read-only `profile.age18_unverified`.
   - Logout button → `onLogout`.

Use existing class names (`fa-field`, `fa-btn`, `fa-row`) so embedded mode matches shell; wrap with `guest-profile` / `guest-profile-page` for `/account` spacing.

Defer `setState` in effects with `queueMicrotask` when loading local prefs after `user.id` changes (same lint pattern as CI fixes).

- [ ] **Step 3: Styles**

Add `.guest-profile`, panel, and age badge styles using theme tokens.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/components/guest-profile.tsx \
  foodassistant/apps/web/messages/ru.json \
  foodassistant/apps/web/messages/en.json \
  foodassistant/apps/web/messages/ro.json \
  foodassistant/apps/web/src/app/premium.css
git commit -m "feat(web): add shared GuestProfile component"
```

---

### Task 6: `/account` page

**Files:**
- Create: `foodassistant/apps/web/src/app/account/page.tsx`

- [ ] **Step 1: Implement page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { GuestProfile } from "@/components/guest-profile";
import { useLocale } from "@/components/locale-provider";
import {
  fetchMe,
  getToken,
  logout,
  type User,
} from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!getToken()) {
        if (alive) {
          setUser(null);
          setReady(true);
        }
        return;
      }
      fetchMe()
        .then((u) => {
          if (alive) setUser(u);
        })
        .catch(() => {
          if (alive) setUser(null);
        })
        .finally(() => {
          if (alive) setReady(true);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="account-page">
        <SiteHeader />
        <p className="account-loading">{/* loading */}</p>
      </div>
    );
  }

  return (
    <div className="account-page">
      <SiteHeader />
      <main className="account-main">
        {toast && <p className="account-toast" role="status">{toast}</p>}
        <GuestProfile
          user={user}
          onRequestSignIn={() => router.push("/login?next=/account")}
          onUserUpdated={setUser}
          onLogout={() => {
            logout();
            setUser(null);
            setToast(t("auth.logout" as never)); // use real key present in messages
          }}
          onToast={setToast}
        />
      </main>
    </div>
  );
}
```

If `/login` does not honor `?next=`, extend login page in the same task:

```ts
const next = searchParams.get("next") || redirectPathForRole(res.user.role);
router.replace(next.startsWith("/") ? next : "/");
```

Only allow relative paths starting with `/` (no open redirect).

- [ ] **Step 2: Smoke**

Visit `/account` signed out → CTA to login. Sign in → return to `/account` with form.

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/app/account/page.tsx \
  foodassistant/apps/web/src/app/login/page.tsx
git commit -m "feat(web): add /account guest profile page"
```

---

### Task 7: Wire app-shell Profile tab + favorite from venue (minimal)

**Files:**
- Modify: `foodassistant/apps/web/src/components/app-shell.tsx`
- Modify: `foodassistant/apps/web/src/app/venues/[id]/page.tsx` (optional heart / “Add to favorites”)

- [ ] **Step 1: Replace Profile tab body**

Remove duplicated identity fields / stub rows. Render:

```tsx
{screen === "profile" && (
  <div className="fa-content">
    <GuestProfile
      embedded
      user={user}
      onRequestSignIn={() => setAuthOpen(true)}
      onUserUpdated={(u) => {
        setUser(u);
        setProfileDraft({
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          display_name: u.display_name || "",
        });
      }}
      onLogout={() => {
        apiLogout();
        setUser(null);
        showToast(t("auth.logout"));
      }}
      onToast={showToast}
    />
  </div>
)}
```

Keep `saveProfile` only if still used elsewhere; otherwise delete dead `profileDraft` UI paths carefully (draft may still sync from `fetchMe` for other features — leave state if needed, remove only JSX duplication).

- [ ] **Step 2: Favorites add entry point**

On venue page (signed-in only), button “Add to favorites” that:

```ts
const prefs = loadGuestLocalPrefs(user.id);
const next = addFavoriteVenue(prefs, {
  venueId: venue.id,
  name: pickLocale(venue.name, locale),
});
saveGuestLocalPrefs(user.id, next);
```

If unsigned, prompt login. This satisfies “working favorites” beyond remove-only.

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/components/app-shell.tsx \
  foodassistant/apps/web/src/app/venues/[id]/page.tsx
git commit -m "feat(web): mount GuestProfile in app shell and enable favorite venues"
```

---

### Task 8: README TODO features + product doc touch

**Files:**
- Modify: `foodassistant/README.md`
- Modify: `docs/CHANGELOG.md` (patch note)
- Modify: `docs/UX_SCREENS.md` (one line: Profile also at `/account`)

- [ ] **Step 1: Add README section**

After “Что работает” (or near the end), add:

```markdown
## TODO features (guest profile)

Local / UI-only in the current web guest cabinet — still to build on the backend:

- [ ] Favorites sync (API + DB; replace `localStorage`)
- [ ] Allergies / diet on `User` + `updateMe`
- [ ] Adult 18+ fields (`adult_preorder_allowed`, verifier metadata) + staff grant API
- [ ] Real payment methods / gateway (replace placeholders)
- [ ] Optional: follow `prefers-color-scheme` when the user has not chosen a theme
```

- [ ] **Step 2: Changelog**

Under a new patch entry (e.g. `[1.4.3]` or next free): guest `/account`, shared profile, theme toggle, local favorites/allergies.

- [ ] **Step 3: Commit**

```bash
git add foodassistant/README.md docs/CHANGELOG.md docs/UX_SCREENS.md
git commit -m "docs: note guest profile TODO features and /account surface"
```

---

### Task 9: Verification

- [ ] **Step 1: Lint + unit tests**

```bash
cd foodassistant/apps/web && npm test && npm run lint
```

Expected: all tests PASS; eslint exit 0.

- [ ] **Step 2: Manual checklist**

- [ ] `/account` + Profile tab show the same blocks
- [ ] Identity save hits API
- [ ] Favorites add on venue / remove on profile; survive refresh
- [ ] Allergies survive refresh
- [ ] Payments placeholder only
- [ ] 18+ read-only unverified
- [ ] Theme toggle on header; `/`, `/login`, `/register`, `/account` all follow theme; default dark; persists
- [ ] README TODO list present

- [ ] **Step 3: Final commit if any lint fixups**

```bash
git commit -m "fix(web): guest profile lint/test cleanups"
```

---

## Spec coverage (self-check)

| Spec requirement | Task |
|---|---|
| Shared UI `/account` + Profile tab | 5, 6, 7 |
| Identity + language via API | 5, 6, 7 |
| Allergies local + README TODO | 4, 5, 8 |
| Favorites local + README TODO | 4, 5, 7, 8 |
| Payments placeholders | 5 |
| 18+ read-only stub + README TODO | 5, 8 |
| Dark/light theme default dark | 1, 2, 3 |
| Auth gate | 6 |
| Owner `/cabinet` untouched | (no task modifies owner flows) |
| Tests for local prefs / theme | 1, 4 |
| Login/register on theme tokens | 2 |

## Placeholder scan

No TBD steps; concrete file paths, commands, and code included.
