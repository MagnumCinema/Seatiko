import { formatDbTime } from '../../core/time/time.js';
import type { UserRecord } from './accounts.repository.js';

/** The user JSON of the Go API (no password hash or storage key; omitempty fields left out). */
export function presentUser(u: UserRecord) {
  return {
    id: u.id,
    email: u.email,
    ...(u.phone ? { phone: u.phone } : {}),
    first_name: u.firstName,
    last_name: u.lastName,
    display_name: u.displayName,
    locale: u.locale,
    role: u.role,
    ...(u.dietPreferences.length ? { diet_preferences: u.dietPreferences } : {}),
    ...(u.favoriteVenues.length ? { favorite_venues: u.favoriteVenues } : {}),
    ...(u.avatarUrl ? { avatar_url: u.avatarUrl } : {}),
    ...(u.deletedAt ? { deleted_at: formatDbTime(u.deletedAt) } : {}),
    /** false for an account created with Google until it sets a password. */
    has_password: Boolean(u.passwordHash),
    adult_preorder_allowed: u.adultPreorderAllowed,
    ...(u.adultVerification ? { adult_verification: u.adultVerification } : {}),
    created_at: formatDbTime(u.createdAt),
    updated_at: formatDbTime(u.updatedAt),
  };
}

export type UserJson = ReturnType<typeof presentUser>;
