import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TOKEN_TTL_SECONDS, TokenService } from './token.service.js';

const SECRET = 'contract-test-secret-contract-test';

/** A token exactly as the Go API (golang-jwt, HS256) signs it. */
function goToken(claims: Record<string, unknown>, secret = SECRET): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}

describe('TokenService', () => {
  const service = new TokenService(new JwtService(), { get: () => SECRET } as unknown as ConfigService<never, true>);
  const now = Math.floor(Date.now() / 1000);

  it('accepts tokens issued by the Go API', async () => {
    const claims = await service.verify(goToken({ uid: 'user-1', email: 'a@b.c', iss: 'seatiko', exp: now + 600, iat: now }));
    expect(claims).toMatchObject({ uid: 'user-1', email: 'a@b.c' });
  });

  it('issues tokens with the Go claims and a 7 day lifetime', async () => {
    const token = await service.issue('user-2', 'x@y.z');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ uid: 'user-2', email: 'x@y.z', iss: 'seatiko' });
    expect(payload.exp - payload.iat).toBe(TOKEN_TTL_SECONDS);
    expect(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('rejects expired, foreign and malformed tokens with 401 invalid_token', async () => {
    for (const token of [
      goToken({ uid: 'u', email: 'e', iss: 'seatiko', exp: now - 10, iat: now - 100 }),
      goToken({ uid: 'u', email: 'e', iss: 'seatiko', exp: now + 600, iat: now }, 'another-secret-another-secret'),
      goToken({ uid: 'u', email: 'e', iss: 'evil', exp: now + 600, iat: now }),
      'not.a.token',
    ]) {
      await expect(service.verify(token)).rejects.toMatchObject({ code: 'invalid_token', status: 401 });
    }
  });
});
