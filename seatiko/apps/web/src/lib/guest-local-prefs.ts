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
