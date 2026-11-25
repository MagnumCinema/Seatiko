import { createHmac } from 'node:crypto';
import { onboardingTasks } from './onboarding-tasks.js';
import { phoneFromTwenty, phoneValue } from './projection.js';
import { verifyWebhook } from './webhook-signature.js';

describe('webhook signature', () => {
  const body = Buffer.from('{"eventName":"person.updated"}');
  const now = 1_790_000_000_000;
  const sign = (ts: string) => createHmac('sha256', 'secret').update(`${ts}:`).update(body).digest('hex');
  it('accepts a fresh signature in ms or seconds, with or without sha256=', () => {
    expect(verifyWebhook('secret', String(now), sign(String(now)), body, now)).toBeUndefined();
    const s = String(now / 1000);
    expect(verifyWebhook('secret', s, `sha256=${sign(s)}`, body, now)).toBeUndefined();
  });
  it('rejects a bad signature, an old timestamp and a missing secret', () => {
    expect(verifyWebhook('secret', String(now), 'deadbeef', body, now)).toMatch(/invalid/);
    expect(verifyWebhook('secret', String(now - 10 * 60_000), sign(String(now - 10 * 60_000)), body, now)).toMatch(/window/);
    expect(verifyWebhook('', String(now), sign(String(now)), body, now)).toMatch(/not configured/);
  });
});

describe('projection', () => {
  it('splits Moldovan phones and joins them back', () => {
    expect(phoneValue('+373 69 000 000')).toMatchObject({ primaryPhoneNumber: '69 000 000', primaryPhoneCallingCode: '+373', primaryPhoneCountryCode: 'MD' });
    expect(phoneFromTwenty({ primaryPhoneNumber: '69000000', primaryPhoneCallingCode: '+373' })).toBe('+37369000000');
  });
});

describe('onboarding tasks', () => {
  const t = (s: string) => ({ ru: s, en: s, ro: s });
  const base = { id: 'app1', name: t('Oliva'), photoUrls: [], rejectReason: '', createdAt: '2026-11-20 10:00:00+00', submittedAt: '2026-11-21 10:00:00.123456+00' };
  it('review task, plus overdue after 48 h', () => {
    const fresh = onboardingTasks({ ...base, status: 'SUBMITTED' }, [], new Date('2026-11-21T12:00:00Z'));
    expect(fresh.map((x) => x.title)).toEqual(['Проверить заявку · Oliva']);
    expect(fresh[0].key).toBe('seatiko:onboarding:app1:review:2026-11-21T10:00:00.123456Z');
    expect(onboardingTasks({ ...base, status: 'SUBMITTED' }, [], new Date('2026-11-24T00:00:00Z'))).toHaveLength(2);
  });
  it('photos task for a stale draft without photos, none once published', () => {
    expect(onboardingTasks({ ...base, status: 'DRAFT', submittedAt: null }, [], new Date('2026-11-22T00:00:00Z'))[0].title).toMatch(/фотографии/);
    expect(onboardingTasks({ ...base, status: 'PUBLISHED' }, [], new Date('2026-11-22T00:00:00Z'))).toEqual([]);
  });
});
