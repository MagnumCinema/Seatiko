import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env.schema.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';

// A stand-in for Google: its own RSA key served as a JWKS, ID tokens with Google's claims.
const WEB = 'web-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
let server: Server;
let jwksUrl = '';

function idToken(claims: Record<string, unknown>, key: KeyObject = privateKey): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64({
    iss: 'https://accounts.google.com',
    aud: WEB,
    sub: '1098',
    email: 'Ada@Gmail.com',
    email_verified: true,
    given_name: 'Ada',
    family_name: 'Lovelace',
    iat: now,
    exp: now + 3600,
    ...claims,
  })}`;
  return `${body}.${sign('sha256', Buffer.from(body), key).toString('base64url')}`;
}

function verifier(clientIds: string[] = [WEB]): GoogleIdTokenVerifier {
  const env = { GOOGLE_CLIENT_IDS: clientIds, GOOGLE_JWKS_URL: jwksUrl } as Partial<Env>;
  return new GoogleIdTokenVerifier({ get: (k: keyof Env) => env[k] } as unknown as ConfigService<Env, true>);
}

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof DomainError ? `${e.status} ${e.code}` : String(e)));

beforeAll(async () => {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/certs`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('GoogleIdTokenVerifier', () => {
  it('accepts a Google ID token for our client and reads the account', async () => {
    await expect(verifier().verify(idToken({}))).resolves.toEqual({
      subject: '1098',
      email: 'ada@gmail.com',
      emailVerified: true,
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
  });

  it('accepts both issuers Google documents, and any listed client (Android)', async () => {
    expect(await code(verifier().verify(idToken({ iss: 'accounts.google.com' })))).toBe('ok');
    expect(await code(verifier([WEB, 'android']).verify(idToken({ aud: 'android' })))).toBe('ok');
  });

  it('refuses tokens issued to another site, by another issuer, expired or forged', async () => {
    const v = verifier();
    expect(await code(v.verify(idToken({ aud: 'someone-else' })))).toBe('401 invalid_google_token');
    expect(await code(v.verify(idToken({ iss: 'https://evil.example' })))).toBe('401 invalid_google_token');
    expect(await code(v.verify(idToken({ exp: Math.floor(Date.now() / 1000) - 3600 })))).toBe('401 invalid_google_token');
    const forged = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(await code(v.verify(idToken({}, forged)))).toBe('401 invalid_google_token');
    expect(await code(v.verify('not-a-jwt'))).toBe('401 invalid_google_token');
  });

  it('reports an unverified email as such', async () => {
    expect((await verifier().verify(idToken({ email_verified: false }))).emailVerified).toBe(false);
  });

  it('is off without client IDs', async () => {
    const v = verifier([]);
    expect(v.enabled).toBe(false);
    expect(await code(v.verify(idToken({})))).toBe('503 google_signin_disabled');
  });
});
