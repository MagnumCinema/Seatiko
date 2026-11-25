import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_SECRET = 'seatiko-qr-dev-secret';

/** Stable HMAC token of a venue table, as qr.Sign in Go (base64url, no padding). */
export function signQr(secret: string, venueId: string, tableId: string): string {
  return createHmac('sha256', secret.trim() || DEFAULT_SECRET)
    .update(`${venueId}:${tableId}`)
    .digest('base64url');
}

export function verifyQr(secret: string, venueId: string, tableId: string, token: string): boolean {
  const expected = Buffer.from(signQr(secret, venueId, tableId));
  const given = Buffer.from(token.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The old "venueId:tableId" format, still accepted. */
export const legacyQr = (venueId: string, tableId: string) => `${venueId}:${tableId}`;

/** Opaque random token stored on a table (qr.RandomToken). */
export const randomQr = () => randomBytes(16).toString('hex');
