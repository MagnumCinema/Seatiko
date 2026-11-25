import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound, pgCode, unauthorized } from '../../core/errors/domain-error.js';
import { TokenService } from '../../core/auth/token.service.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { squareJpeg } from '../../integrations/storage/image.js';
import { type GoogleAccount, GoogleIdTokenVerifier } from '../../integrations/google/google-id-token.verifier.js';
import { MediaStorage } from '../../integrations/storage/media-storage.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { presentUser } from './accounts.presenter.js';
import { AccountsRepository, type UserRecord } from './accounts.repository.js';

/** bcrypt.DefaultCost in Go; hashes stay interchangeable both ways. */
const BCRYPT_COST = 10;
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+$/;

export type GoogleSignInInput = { credential: string; role?: string; locale?: string };
export type RegisterInput = { email: string; password: string; first_name?: string; last_name?: string; locale?: string; role?: string };
export type ProfilePatch = {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  locale?: string;
  diet_preferences?: string[];
  favorite_venues?: string[];
};

/** Anonymous address of an erased account (same as deletedEmail in Go). */
const deletedEmail = (id: string) => `deleted-${id.slice(0, 12)}@deleted.invalid`;

@Injectable()
export class AccountsService {
  constructor(
    private readonly repo: AccountsRepository,
    private readonly tokens: TokenService,
    private readonly media: MediaStorage,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
    private readonly google: GoogleIdTokenVerifier,
  ) {}

  private now() {
    return this.clock.now().toISOString();
  }

  private async session(user: UserRecord) {
    return { token: await this.tokens.issue(user.id, user.email), user: presentUser(user) };
  }

  async register(input: RegisterInput) {
    if (await this.repo.emailTaken(input.email)) throw conflict('email_taken');
    const role = input.role || 'guest';
    if (role !== 'guest' && role !== 'restaurant') throw badRequest('invalid_role');
    const first = input.first_name ?? '';
    const last = input.last_name ?? '';
    const now = this.now();
    let user: UserRecord;
    try {
      user = await this.repo.insert({
        id: randomUUID(),
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
        firstName: first,
        lastName: last,
        displayName: `${first} ${last}`.trim() || input.email,
        locale: input.locale || 'ru',
        role,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Two sign-ups racing for one address: the unique index decides.
      if (pgCode(error) === '23505') throw conflict('email_taken');
      throw error;
    }
    return this.session(user);
  }

  async login(email: string, password: string) {
    const user = await this.repo.byEmail(email);
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('invalid_credentials');
    return this.session(user);
  }

  /** Sign-in options for the site and the app (which buttons to show). */
  providers() {
    return { google: { enabled: this.google.enabled, client_id: this.google.webClientId } };
  }

  /**
   * Sign in (or sign up) with a Google ID token. The Google account is found by its
   * `sub`; a first sign-in creates a guest (or restaurant) account without a password,
   * only for an address Google verified. An existing password account with that address
   * is never handed over (account pre-hijacking): 409 link_required — sign in with the
   * password and connect Google in the profile.
   */
  async signInWithGoogle(input: GoogleSignInInput) {
    const google = await this.google.verify(input.credential);
    const linked = await this.repo.byIdentity('google', google.subject);
    if (linked) return this.googleSession(linked);
    if (!google.email || !google.emailVerified) throw forbidden('google_email_unverified');
    const role = input.role || 'guest';
    if (role !== 'guest' && role !== 'restaurant') throw badRequest('invalid_role');
    const now = this.now();
    const created = await this.repo.createWithIdentity(
      {
        id: randomUUID(),
        email: google.email,
        passwordHash: '',
        firstName: google.givenName,
        lastName: google.familyName,
        displayName: `${google.givenName} ${google.familyName}`.trim() || google.email,
        locale: ['ru', 'en', 'ro'].includes(input.locale ?? '') ? input.locale! : 'ru',
        role,
        createdAt: now,
        updatedAt: now,
      },
      { provider: 'google', subject: google.subject, email: google.email },
    );
    if (created) return { ...(await this.session(created)), created: true };
    // The address is taken: a concurrent first sign-in with this Google account may have
    // just created the user, and then it is this one.
    const raced = await this.repo.byIdentity('google', google.subject);
    if (raced) return this.googleSession(raced);
    throw conflict('link_required');
  }

  private async googleSession(user: UserRecord) {
    if (user.deletedAt) throw unauthorized('invalid_credentials');
    return { ...(await this.session(user)), created: false };
  }

  async identities(userId: string) {
    return { identities: (await this.repo.identities(userId)).map((i) => ({ provider: i.provider, email: i.email, created_at: formatDbTime(i.createdAt) })) };
  }

  /** Connects a Google account to a signed-in user; a password account confirms its password. */
  async connectGoogle(userId: string, credential: string, password: string | undefined) {
    const user = await this.user(userId);
    if (user.passwordHash) {
      if (!password) throw badRequest('password_required');
      if (!(await bcrypt.compare(password, user.passwordHash))) throw forbidden('wrong_password');
    }
    const google: GoogleAccount = await this.google.verify(credential);
    if (await this.repo.link(userId, { provider: 'google', subject: google.subject, email: google.email }, this.now())) return this.identities(userId);
    const owner = await this.repo.identityOwner('google', google.subject);
    if (owner === userId) return this.identities(userId);
    throw conflict(owner ? 'google_linked_elsewhere' : 'google_already_connected');
  }

  async disconnectGoogle(userId: string) {
    if (await this.repo.unlink(userId, 'google')) return this.identities(userId);
    const linked = (await this.repo.identities(userId)).some((i) => i.provider === 'google');
    if (!linked) throw notFound('google_not_connected');
    // Google is the only way in: set a password first.
    throw conflict('password_required_first');
  }

  /** For the auth guard: role and whether the account was erased. */
  async status(userId: string) {
    const user = await this.repo.byId(userId);
    return user && { role: user.role, deleted: Boolean(user.deletedAt) };
  }

  async user(userId: string): Promise<UserRecord> {
    const user = await this.repo.byId(userId);
    if (!user) throw notFound('user_not_found');
    return user;
  }

  async me(userId: string) {
    return presentUser(await this.user(userId));
  }

  async updateProfile(userId: string, p: ProfilePatch) {
    const user = await this.repo.update(userId, {
      ...(p.first_name !== undefined ? { firstName: p.first_name } : {}),
      ...(p.last_name !== undefined ? { lastName: p.last_name } : {}),
      ...(p.display_name !== undefined ? { displayName: p.display_name } : {}),
      ...(p.phone !== undefined ? { phone: p.phone } : {}),
      ...(p.locale ? { locale: p.locale } : {}),
      ...(p.diet_preferences !== undefined ? { dietPreferences: p.diet_preferences } : {}),
      ...(p.favorite_venues !== undefined ? { favoriteVenues: p.favorite_venues } : {}),
      updatedAt: this.now(),
    });
    if (!user) throw notFound('user_not_found');
    return presentUser(user);
  }

  async updateEmail(userId: string, raw: string) {
    const email = raw.trim().toLowerCase();
    if (!EMAIL.test(email)) throw badRequest('invalid_email');
    if (await this.repo.emailTaken(email, userId)) throw conflict('email_taken');
    const user = await this.repo.update(userId, { email, updatedAt: this.now() });
    if (!user) throw notFound('user_not_found');
    return presentUser(user);
  }

  /** Changes the password; an account created with Google sets its first one without an old one. */
  async updatePassword(userId: string, oldPassword: string | undefined, newPassword: string) {
    const user = await this.user(userId);
    if (newPassword.length < 6) throw badRequest('password_too_short');
    if (user.passwordHash && !(oldPassword && (await bcrypt.compare(oldPassword, user.passwordHash)))) throw badRequest('invalid_old_password');
    await this.repo.update(userId, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), updatedAt: this.now() });
    return { status: 'ok' };
  }

  /**
   * GDPR deletion (DELETE /me): guests only, with their password. The row stays as an
   * anonymous stub so orders and the 18+ audit keep a stable user id; sign-in is impossible.
   */
  async deleteAccount(userId: string, password: string | undefined) {
    const user = await this.repo.byId(userId);
    if (!user || user.deletedAt) throw notFound('user_not_found');
    if (user.role !== 'guest') throw forbidden('role_not_allowed');
    // An account created with Google has no password; its session is the proof.
    if (user.passwordHash) {
      if (!password) throw badRequest('password_required');
      if (!(await bcrypt.compare(password, user.passwordHash))) throw forbidden('wrong_password');
    }

    const now = this.clock.now();
    const publish: Array<() => void> = [];
    const result = await this.repo.transaction(async (tx) => {
      const erased = await this.repo.eraseGuestData(tx, userId, now);
      for (const p of erased.preorders) {
        const staff = await this.notifications.venueStaffRecipients(p.venueId, tx);
        publish.push(await this.notifications.notify('PREORDER_CANCELLED', staff, { venueId: p.venueId, reservationId: p.reservationId, orderId: p.orderId, at: p.reservedFor }, tx));
      }
      await this.repo.anonymize(tx, userId, deletedEmail(userId), now.toISOString());
      return erased;
    });
    for (const p of publish) p();
    await this.media.delete(user.avatarKey);
    return { deleted: true, cancelled_reservations: result.cancelled };
  }

  /** New profile photo: 512×512 JPEG, previous one removed from storage. */
  async setAvatar(userId: string, data: Uint8Array) {
    const user = await this.repo.byId(userId);
    if (!user || user.deletedAt) throw notFound('user_not_found');
    const jpeg = await squareJpeg(data);
    const key = `avatars/${userId}/${randomUUID()}.jpg`;
    const url = await this.media.put(key, 'image/jpeg', jpeg);
    const updated = await this.repo.update(userId, { avatarUrl: url, avatarKey: key, updatedAt: this.now() });
    if (!updated) {
      await this.media.delete(key);
      throw notFound('user_not_found');
    }
    await this.media.delete(user.avatarKey);
    return presentUser(updated);
  }

  async deleteAvatar(userId: string) {
    const user = await this.repo.byId(userId);
    if (!user || user.deletedAt) throw notFound('user_not_found');
    const updated = await this.repo.update(userId, { avatarUrl: '', avatarKey: '', updatedAt: this.now() });
    await this.media.delete(user.avatarKey);
    return presentUser(updated!);
  }
}
