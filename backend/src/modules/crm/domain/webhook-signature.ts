import { createHmac, timingSafeEqual } from 'node:crypto';

const WINDOW_MS = 5 * 60_000;

/**
 * Twenty signs `${timestamp}:${body}` with HMAC-SHA256 (hex, optional "sha256=").
 * The timestamp is Date.now() in ms (seconds or RFC 3339 accepted too) and must be
 * within 5 minutes. Returns the reason when invalid.
 */
export function verifyWebhook(secret: string, timestamp: string, signature: string, payload: Buffer, now = Date.now()): string | undefined {
  if (!secret) return 'Twenty webhook secret is not configured';
  if (!timestamp || !signature) return 'Twenty webhook signature headers are missing';
  let at: number;
  if (/^\d+$/.test(timestamp)) {
    const n = Number(timestamp);
    at = n > 1_000_000_000_000 ? n : n * 1000;
  } else {
    at = Date.parse(timestamp);
    if (!Number.isFinite(at)) return 'invalid Twenty webhook timestamp';
  }
  if (Math.abs(now - at) > WINDOW_MS) return 'Twenty webhook timestamp is outside the allowed window';
  const expected = createHmac('sha256', secret).update(`${timestamp}:`).update(payload).digest();
  const hex = signature.replace(/^sha256=/, '');
  const received = /^[0-9a-fA-F]+$/.test(hex) ? Buffer.from(hex, 'hex') : Buffer.alloc(0);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return 'invalid Twenty webhook signature';
  return undefined;
}
