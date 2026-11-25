import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound, pgCode, unauthorized } from '../../core/errors/domain-error.js';
import { TokenService } from '../../core/auth/token.service.js';
import { Clock } from '../../core/time/time.js';
import { squareJpeg } from '../../integrations/storage/image.js';
import { MediaStorage } from '../../integrations/storage/media-storage.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { presentUser } from './accounts.presenter.js';
import { AccountsRepository, type UserRecord } from './accounts.repository.js';

/** bcrypt.DefaultCost in Go; hashes stay interchangeable both ways. */
const BCRYPT_COST = 10;
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+$/;

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

  async updatePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.user(userId);
    if (newPassword.length < 6) throw badRequest('password_too_short');
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) throw badRequest('invalid_old_password');
    await this.repo.update(userId, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), updatedAt: this.now() });
    return { status: 'ok' };
  }

  /**
   * GDPR deletion (DELETE /me): guests only, with their password. The row stays as an
   * anonymous stub so orders and the 18+ audit keep a stable user id; sign-in is impossible.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.repo.byId(userId);
    if (!user || user.deletedAt) throw notFound('user_not_found');
    if (user.role !== 'guest') throw forbidden('role_not_allowed');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw forbidden('wrong_password');

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
