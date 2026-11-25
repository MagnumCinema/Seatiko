import { legacyQr, randomQr, signQr, verifyQr } from './qr-token.js';

describe('QR tokens (compatible with internal/qr)', () => {
  it('signs and verifies per table', () => {
    const token = signQr('secret', 'venue-1', 'table-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyQr('secret', 'venue-1', 'table-1', token)).toBe(true);
    expect(verifyQr('secret', 'venue-1', 'table-2', token)).toBe(false);
  });

  it('matches the Go HMAC-SHA256 base64url output', () => {
    // echo -n 'venue-1:t1' | openssl dgst -sha256 -hmac seatiko-qr-dev-secret -binary | base64 | tr '+/' '-_' | tr -d '='
    expect(signQr('', 'venue-1', 't1')).toBe('XOfXXjI6x2snYc5KIqsj9voFXDvyzD_I4rSWZ5cZMcU');
  });

  it('legacy and random tokens', () => {
    expect(legacyQr('a', 'b')).toBe('a:b');
    expect(randomQr()).toMatch(/^[0-9a-f]{32}$/);
  });
});
