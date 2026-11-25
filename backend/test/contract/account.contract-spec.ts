import { crc32, deflateSync } from 'node:zlib';
import { api, login, newGuest } from './client.js';

// Sign-up, sign-in, profile, avatar, notifications and GDPR deletion.

/** Go writes RFC 3339 UTC with up to 9 fractional digits and no trailing zeros. */
export const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/;

function jwtClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function pngBytes(width: number, height: number): Uint8Array {
  // Minimal valid PNG (one grey row repeated) built without dependencies.
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 128)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

describe('register and login', () => {
  it('registers a guest and returns a JWT compatible with the Go API', async () => {
    const { token, user, email } = await newGuest('reg');
    expect(user).toMatchObject({ email, first_name: 'Test', last_name: 'Guest', role: 'guest', locale: 'ru', adult_preorder_allowed: false });
    expect(user.created_at).toMatch(RFC3339);
    expect(user).not.toHaveProperty('password_hash');
    const claims = jwtClaims(token);
    expect(claims).toMatchObject({ uid: user.id, email, iss: 'seatiko' });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(7 * 24 * 3600);
  });

  it('rejects duplicates, short passwords and wrong credentials', async () => {
    const { email } = await newGuest('dup');
    const dup = await api('POST', '/api/v1/auth/register', { body: { email, password: 'secret123' } });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: 'email_taken' });
    const short = await api('POST', '/api/v1/auth/register', { body: { email: 'x@y.z', password: '1' } });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ error: 'invalid_body' });
    const wrong = await api('POST', '/api/v1/auth/login', { body: { email, password: 'nope' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'invalid_credentials' });
  });

  it('demo accounts sign in with their roles', async () => {
    for (const [email, password, role] of [
      ['admin@seatiko.local', 'admin123', 'admin'],
      ['owner@seatiko.local', 'owner123', 'restaurant'],
      ['staff@seatiko.local', 'staff123', 'staff'],
      ['guest@seatiko.local', 'guest123', 'guest'],
    ]) {
      const res = await api('POST', '/api/v1/auth/login', { body: { email, password } });
      expect(res.status, email).toBe(200);
      expect(res.body.user.role).toBe(role);
    }
  });

  it('protects routes: no token, bad token', async () => {
    const none = await api('GET', '/api/v1/me');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: 'auth_required' });
    const bad = await api('GET', '/api/v1/me', { token: 'xxx' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'invalid_token' });
  });

  it('enforces roles on staff, restaurant and admin routes', async () => {
    const { token } = await newGuest('role');
    expect((await api('GET', '/api/v1/admin/overview', { token })).status).toBe(403);
    expect((await api('GET', '/api/v1/restaurant/applications', { token })).status).toBe(403);
    expect((await api('GET', '/api/v1/staff/orders', { token, query: { venue_id: 'venue-1' } })).status).toBe(403);
  });
});

describe('profile', () => {
  it('GET and PATCH /me', async () => {
    const { token, user } = await newGuest('me');
    const me = await api('GET', '/api/v1/me', { token });
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    const patched = await api('PATCH', '/api/v1/me', {
      token,
      body: { first_name: 'Ion', phone: '+37369000000', diet_preferences: ['vegan'], favorite_venues: ['venue-1'], locale: 'ro' },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.user).toMatchObject({ first_name: 'Ion', phone: '+37369000000', diet_preferences: ['vegan'], favorite_venues: ['venue-1'], locale: 'ro' });
    // Guests cannot grant themselves 18+.
    const sneaky = await api('PATCH', '/api/v1/me', { token, body: { adult_preorder_allowed: true } });
    expect(sneaky.body.user.adult_preorder_allowed).toBe(false);
  });

  it('PATCH /me/email and /me/password', async () => {
    const guest = await newGuest('cred');
    const taken = await api('PATCH', '/api/v1/me/email', { token: guest.token, body: { email: 'admin@seatiko.local' } });
    expect(taken.status).toBe(409);
    expect(taken.body).toEqual({ error: 'email_taken' });
    const newEmail = `new-${guest.email}`;
    const changed = await api('PATCH', '/api/v1/me/email', { token: guest.token, body: { email: newEmail } });
    expect(changed.status).toBe(200);
    expect(changed.body.user.email).toBe(newEmail);

    const wrong = await api('PATCH', '/api/v1/me/password', { token: guest.token, body: { old_password: 'nope', new_password: 'secret456' } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const ok = await api('PATCH', '/api/v1/me/password', { token: guest.token, body: { old_password: 'secret123', new_password: 'secret456' } });
    expect(ok.status).toBe(200);
    expect(await login(newEmail, 'secret456')).toEqual(expect.any(String));
  });
});

describe('avatar', () => {
  it('uploads a photo, refuses SVG, deletes it', async () => {
    const { token } = await newGuest('avatar');
    const form = new FormData();
    form.append('file', new Blob([pngBytes(900, 600)], { type: 'image/png' }), 'me.png');
    const up = await api('POST', '/api/v1/me/avatar', { token, form });
    expect(up.status).toBe(200);
    expect(up.body.user.avatar_url).toMatch(/\.jpg$/);

    const svg = new FormData();
    svg.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: 'image/png' }), 'evil.png');
    const refused = await api('POST', '/api/v1/me/avatar', { token, form: svg });
    expect(refused.status).toBe(415);
    expect(refused.body).toEqual({ error: 'unsupported_image' });

    const removed = await api('DELETE', '/api/v1/me/avatar', { token });
    expect(removed.status).toBe(200);
    expect(removed.body.user.avatar_url).toBeUndefined();
  });
});

describe('notifications', () => {
  it('lists, marks read and streams (ready event)', async () => {
    const { token } = await newGuest('notify');
    const list = await api('GET', '/api/v1/me/notifications', { token });
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ notifications: [], unread: 0 });
    const read = await api('POST', '/api/v1/me/notifications/read', { token, body: {} });
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ marked: 0, unread: 0 });

    const controller = new AbortController();
    const res = await fetch(`${process.env.CONTRACT_BASE_URL ?? 'http://127.0.0.1:18090'}/api/v1/me/notifications/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    controller.abort();
    expect(new TextDecoder().decode(value)).toContain('event: ready\ndata: {"unread":0}');
    // Record the hit for coverage (fetch bypasses the client).
    await api('GET', '/api/v1/me/notifications/stream', { token: 'invalid' });
  });
});

describe('GDPR deletion', () => {
  it('DELETE /me needs the password, then old tokens and sign-in stop working', async () => {
    const guest = await newGuest('gdpr');
    const wrong = await api('DELETE', '/api/v1/me', { token: guest.token, body: { password: 'nope' } });
    expect(wrong.status).toBe(403);
    expect(wrong.body).toEqual({ error: 'wrong_password' });
    const ok = await api('DELETE', '/api/v1/me', { token: guest.token, body: { password: guest.password } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ deleted: true, cancelled_reservations: 0 });
    const after = await api('GET', '/api/v1/me', { token: guest.token });
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: 'account_deleted' });
    expect((await api('POST', '/api/v1/auth/login', { body: { email: guest.email, password: guest.password } })).status).toBe(401);
  });

  it('only guests can delete themselves', async () => {
    const token = await login('owner@seatiko.local', 'owner123');
    const res = await api('DELETE', '/api/v1/me', { token, body: { password: 'owner123' } });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'role_not_allowed' });
  });
});
