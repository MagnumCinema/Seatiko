import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../core/errors/domain-error.js';
import type { GoogleAccount } from '../../integrations/google/google-id-token.verifier.js';
import type { UserRecord } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';

const ada: GoogleAccount = { subject: '1098', email: 'ada@gmail.com', emailVerified: true, givenName: 'Ada', familyName: 'Lovelace' };

function user(over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    email: 'ada@gmail.com',
    passwordHash: '',
    phone: '',
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada Lovelace',
    locale: 'ru',
    role: 'guest',
    dietPreferences: [],
    favoriteVenues: [],
    avatarUrl: '',
    avatarKey: '',
    adultPreorderAllowed: false,
    adultVerification: null,
    deletedAt: null,
    createdAt: '2026-11-25 10:00:00+00',
    updatedAt: '2026-11-25 10:00:00+00',
    ...over,
  };
}

function setup(account: GoogleAccount = ada) {
  const repo = {
    byIdentity: vi.fn(),
    createWithIdentity: vi.fn(),
    identities: vi.fn().mockResolvedValue([]),
    identityOwner: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn(),
    byId: vi.fn(),
  };
  const google = { verify: vi.fn().mockResolvedValue(account), enabled: true, webClientId: 'web' };
  const tokens = { issue: vi.fn().mockResolvedValue('jwt') };
  const clock = { now: () => new Date('2026-11-25T10:00:00Z') };
  const service = new AccountsService(repo as never, tokens as never, {} as never, {} as never, clock as never, google as never);
  return { service, repo };
}

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof DomainError ? `${e.status} ${e.code}` : String(e)));

describe('Sign in with Google', () => {
  it('signs a linked Google account in to its user, whatever its email is now', async () => {
    const { service, repo } = setup({ ...ada, email: 'new@gmail.com' });
    repo.byIdentity.mockResolvedValue(user());
    const session = await service.signInWithGoogle({ credential: 't' });
    expect(session).toMatchObject({ token: 'jwt', created: false, user: { id: 'u1', has_password: false } });
    expect(repo.createWithIdentity).not.toHaveBeenCalled();
  });

  it('creates a guest without a password on a first sign-in', async () => {
    const { service, repo } = setup();
    repo.byIdentity.mockResolvedValue(undefined);
    repo.createWithIdentity.mockImplementation(async (row) => user(row));
    const session = await service.signInWithGoogle({ credential: 't', locale: 'ro' });
    expect(session).toMatchObject({ created: true, user: { email: 'ada@gmail.com', role: 'guest', locale: 'ro', display_name: 'Ada Lovelace' } });
    expect(repo.createWithIdentity.mock.calls[0][0]).toMatchObject({ passwordHash: '' });
    expect(repo.createWithIdentity.mock.calls[0][1]).toEqual({ provider: 'google', subject: '1098', email: 'ada@gmail.com' });
  });

  it('never creates an account for an address Google did not verify', async () => {
    const { service, repo } = setup({ ...ada, emailVerified: false });
    repo.byIdentity.mockResolvedValue(undefined);
    expect(await code(service.signInWithGoogle({ credential: 't' }))).toBe('403 google_email_unverified');
  });

  it('never hands an existing password account to Google sign-in (pre-hijacking)', async () => {
    const { service, repo } = setup();
    repo.byIdentity.mockResolvedValue(undefined);
    repo.createWithIdentity.mockResolvedValue(undefined);
    expect(await code(service.signInWithGoogle({ credential: 't' }))).toBe('409 link_required');
  });

  it('a concurrent first sign-in of the same Google account lands in the same user', async () => {
    const { service, repo } = setup();
    repo.byIdentity.mockResolvedValueOnce(undefined).mockResolvedValueOnce(user());
    repo.createWithIdentity.mockResolvedValue(undefined);
    expect(await service.signInWithGoogle({ credential: 't' })).toMatchObject({ created: false, user: { id: 'u1' } });
  });

  it('refuses roles other than guest and restaurant', async () => {
    const { service, repo } = setup();
    repo.byIdentity.mockResolvedValue(undefined);
    expect(await code(service.signInWithGoogle({ credential: 't', role: 'admin' }))).toBe('400 invalid_role');
  });
});

describe('Connect and disconnect Google', () => {
  it('a password account confirms its password before connecting', async () => {
    const { service, repo } = setup();
    repo.byId.mockResolvedValue(user({ passwordHash: '$2a$10$abcdefghijklmnopqrstuuKpPq7eYyXy0nWm1o3s2D0q4tqJ6Gm7y' }));
    expect(await code(service.connectGoogle('u1', 't', undefined))).toBe('400 password_required');
    expect(await code(service.connectGoogle('u1', 't', 'wrong'))).toBe('403 wrong_password');
    expect(repo.link).not.toHaveBeenCalled();
  });

  it('a Google account linked to someone else is refused', async () => {
    const { service, repo } = setup();
    repo.byId.mockResolvedValue(user());
    repo.link.mockResolvedValue(false);
    repo.identityOwner.mockResolvedValue('u2');
    expect(await code(service.connectGoogle('u1', 't', undefined))).toBe('409 google_linked_elsewhere');
  });

  it('never disconnects the last way to sign in', async () => {
    const { service, repo } = setup();
    repo.unlink.mockResolvedValue(false);
    repo.identities.mockResolvedValue([{ provider: 'google', email: 'ada@gmail.com', createdAt: '2026-11-25 10:00:00+00' }]);
    expect(await code(service.disconnectGoogle('u1'))).toBe('409 password_required_first');
    repo.identities.mockResolvedValue([]);
    expect(await code(service.disconnectGoogle('u1'))).toBe('404 google_not_connected');
  });
});
