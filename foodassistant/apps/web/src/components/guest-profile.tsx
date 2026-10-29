"use client";

import { useEffect, useState } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { updateMe, type User } from "@/lib/api";
import {
  emptyGuestLocalPrefs,
  loadGuestLocalPrefs,
  removeFavoriteVenue,
  saveGuestLocalPrefs,
  type GuestLocalPrefs,
} from "@/lib/guest-local-prefs";

type GuestProfileProps = {
  user: User | null;
  onRequestSignIn: () => void;
  onUserUpdated?: (user: User) => void;
  onLogout: () => void;
  onToast?: (message: string) => void;
  embedded?: boolean;
};

type ProfileDraft = {
  first_name: string;
  last_name: string;
  display_name: string;
};

type PanelId = "allergies" | "payments" | "favorites";

function draftFromUser(user: User): ProfileDraft {
  return {
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    display_name: user.display_name ?? "",
  };
}

export function GuestProfile({
  user,
  onRequestSignIn,
  onUserUpdated,
  onLogout,
  onToast,
  embedded = false,
}: GuestProfileProps) {
  const { locale, setLocale, t } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const toast = onToast ?? (() => {});

  const [draft, setDraft] = useState<ProfileDraft>(() =>
    user ? draftFromUser(user) : { first_name: "", last_name: "", display_name: "" },
  );
  const [prefs, setPrefs] = useState<GuestLocalPrefs>(emptyGuestLocalPrefs);
  const [allergiesDraft, setAllergiesDraft] = useState("");
  const [paymentCards, setPaymentCards] = useState<string[]>([]);
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || !user) {
      queueMicrotask(() => {
        setDraft({ first_name: "", last_name: "", display_name: "" });
        setPrefs(emptyGuestLocalPrefs());
        setAllergiesDraft("");
        setPaymentCards([]);
        setOpenPanel(null);
      });
      return;
    }
    const nextDraft = draftFromUser(user);
    const loaded = loadGuestLocalPrefs(userId);
    const serverAllergies = user.diet_preferences?.join(", ");
    const allergiesValue = loaded.allergies || serverAllergies || "";
    const effectiveFavorites =
      loaded.favorites.length > 0
        ? loaded.favorites
        : (user.favorite_venues?.map((id) => ({ venueId: id, name: id })) ?? []);
    const nextPrefs = {
      allergies: allergiesValue,
      favorites: effectiveFavorites,
    };
    queueMicrotask(() => {
      setDraft(nextDraft);
      setPrefs(nextPrefs);
      setAllergiesDraft(allergiesValue);
      setPaymentCards([]);
    });
    // Prefs + draft seed only when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userId gate
  }, [userId]);

  function togglePanel(id: PanelId) {
    setOpenPanel((current) => (current === id ? null : id));
  }

  async function saveIdentity() {
    if (!user) return;
    setBusy(true);
    try {
      const next = await updateMe({ ...draft });
      onUserUpdated?.(next);
      toast(t("profile.saved"));
    } catch {
      toast(t("profile.save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(next: Locale) {
    setLocale(next);
    if (!user) return;
    try {
      const updated = await updateMe({ locale: next });
      onUserUpdated?.(updated);
    } catch {
      /* best-effort locale sync */
    }
  }

  async function saveAllergies() {
    if (!user) return;
    const next = { ...prefs, allergies: allergiesDraft };
    saveGuestLocalPrefs(user.id, next);
    setPrefs(next);
    try {
      const dietPrefs = allergiesDraft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateMe({ diet_preferences: dietPrefs });
      onUserUpdated?.(updated);
      toast(t("profile.saved"));
    } catch {
      toast(t("profile.saved"));
    }
  }

  async function removeFavorite(venueId: string) {
    if (!user) return;
    const next = removeFavoriteVenue(prefs, venueId);
    saveGuestLocalPrefs(user.id, next);
    setPrefs(next);
    try {
      const updated = await updateMe({
        favorite_venues: next.favorites.map((f) => f.venueId),
      });
      onUserUpdated?.(updated);
    } catch {
      /* local save succeeded */
    }
  }

  function addPreviewCard() {
    setPaymentCards((cards) => [...cards, t("profile.payments_demo")]);
  }

  const rootClass = embedded
    ? "guest-profile guest-profile-embedded"
    : "guest-profile guest-profile-page";

  if (!user) {
    return (
      <div className={rootClass}>
        {!embedded && <h2 className="fa-h3">{t("profile.account_title")}</h2>}
        <button
          type="button"
          className="fa-btn fa-btn-primary"
          onClick={onRequestSignIn}
        >
          {t("profile.sign_in")}
        </button>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {!embedded && <h2 className="fa-h3">{t("profile.account_title")}</h2>}

      <label className="fa-field">
        <span>{t("profile.email")}</span>
        <input type="email" value={user.email} readOnly />
      </label>

      <label className="fa-field">
        <span>{t("profile.first_name")}</span>
        <input
          value={draft.first_name}
          onChange={(e) =>
            setDraft((p) => ({ ...p, first_name: e.target.value }))
          }
        />
      </label>
      <label className="fa-field">
        <span>{t("profile.last_name")}</span>
        <input
          value={draft.last_name}
          onChange={(e) =>
            setDraft((p) => ({ ...p, last_name: e.target.value }))
          }
        />
      </label>
      <label className="fa-field">
        <span>{t("profile.display_name")}</span>
        <input
          value={draft.display_name}
          onChange={(e) =>
            setDraft((p) => ({ ...p, display_name: e.target.value }))
          }
        />
      </label>
      <button
        type="button"
        className="fa-btn fa-btn-primary"
        disabled={busy}
        onClick={() => void saveIdentity()}
      >
        {t("common.save")}
      </button>

      <div className="fa-row">
        <span>{t("profile.language")}</span>
        <div className="fa-lang-row compact">
          {(["ru", "en", "ro"] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              className={`fa-lang ${locale === l ? "active" : ""}`}
              onClick={() => void changeLocale(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="fa-row">
        <span>{t("theme.toggle")}</span>
        <button
          type="button"
          className="fa-btn fa-btn-outline guest-profile-theme-btn"
          onClick={toggleTheme}
        >
          {theme === "dark" ? t("theme.light") : t("theme.dark")}
        </button>
      </div>

      <button
        type="button"
        className="fa-row guest-profile-panel-toggle"
        onClick={() => togglePanel("allergies")}
        aria-expanded={openPanel === "allergies"}
      >
        <span>{t("profile.allergies")}</span>
        <span aria-hidden>{openPanel === "allergies" ? "▾" : "→"}</span>
      </button>
      {openPanel === "allergies" && (
        <div className="guest-profile-panel">
          <p className="fa-hint left">{t("profile.allergies_hint")}</p>
          <label className="fa-field">
            <span>{t("profile.allergies")}</span>
            <textarea
              className="fa-input guest-profile-textarea"
              rows={3}
              value={allergiesDraft}
              onChange={(e) => setAllergiesDraft(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="fa-btn fa-btn-secondary"
            onClick={saveAllergies}
          >
            {t("profile.allergies_save")}
          </button>
        </div>
      )}

      <button
        type="button"
        className="fa-row guest-profile-panel-toggle"
        onClick={() => togglePanel("payments")}
        aria-expanded={openPanel === "payments"}
      >
        <span>{t("profile.payment_methods")}</span>
        <span aria-hidden>{openPanel === "payments" ? "▾" : "→"}</span>
      </button>
      {openPanel === "payments" && (
        <div className="guest-profile-panel">
          <p className="fa-hint left">{t("profile.payments_placeholder")}</p>
          <div className="fa-row guest-profile-payment-row">
            <span>{t("profile.payments_demo")}</span>
          </div>
          {paymentCards.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="fa-row guest-profile-payment-row"
            >
              <span>{label}</span>
            </div>
          ))}
          <button
            type="button"
            className="fa-btn fa-btn-outline"
            onClick={addPreviewCard}
          >
            {t("profile.payments_add")}
          </button>
        </div>
      )}

      <button
        type="button"
        className="fa-row guest-profile-panel-toggle"
        onClick={() => togglePanel("favorites")}
        aria-expanded={openPanel === "favorites"}
      >
        <span>{t("profile.favorites")}</span>
        <span aria-hidden>{openPanel === "favorites" ? "▾" : "→"}</span>
      </button>
      {openPanel === "favorites" && (
        <div className="guest-profile-panel">
          {prefs.favorites.length === 0 ? (
            <p className="fa-muted">{t("profile.favorites_empty")}</p>
          ) : (
            prefs.favorites.map((fav) => (
              <div key={fav.venueId} className="fa-row">
                <span>{fav.name}</span>
                <button
                  type="button"
                  className="fa-btn fa-btn-outline guest-profile-remove-btn"
                  onClick={() => removeFavorite(fav.venueId)}
                >
                  {t("profile.favorites_remove")}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="fa-row guest-profile-age">
        <span>{t("profile.age18")}</span>
        <span className="guest-profile-age-badge">
          {t("profile.age18_unverified")}
        </span>
      </div>

      <button
        type="button"
        className="fa-btn fa-btn-secondary"
        onClick={onLogout}
      >
        {t("profile.logout")}
      </button>
    </div>
  );
}
