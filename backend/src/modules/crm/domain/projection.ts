// How Seatiko data looks in Twenty (payload helpers of internal/crm/syncer.go).
import type { LocalizedString } from '../../../database/schema/columns.js';

/** Moldovan numbers are split into country code and local number. */
export function phoneValue(raw: string) {
  const phone = raw.trim();
  let number = phone;
  let countryCode = '';
  let callingCode = '';
  if (phone.startsWith('+373')) {
    number = phone.slice(4).trim();
    countryCode = 'MD';
    callingCode = '+373';
  } else if (phone && !phone.startsWith('+')) {
    countryCode = 'MD';
    callingCode = '+373';
  }
  return { primaryPhoneNumber: number, primaryPhoneCountryCode: countryCode, primaryPhoneCallingCode: callingCode, additionalPhones: [] };
}

export const emailValue = (email: string) => ({ primaryEmail: email.trim(), additionalEmails: [] });

/** Twenty keeps one language: Russian, else Romanian, else English. */
export const localizedValue = (v: LocalizedString) => v.ru.trim() || v.ro.trim() || v.en.trim();

/** A phone from Twenty back to one string (calling code + number). */
export function phoneFromTwenty(v: Record<string, unknown> | undefined): string {
  const number = typeof v?.primaryPhoneNumber === 'string' ? v.primaryPhoneNumber.trim() : '';
  const code = typeof v?.primaryPhoneCallingCode === 'string' ? v.primaryPhoneCallingCode.trim() : '';
  return !number || number.startsWith('+') || !code ? number : code + number;
}

/** Demo records of the Go seed never go to the CRM. */
export const isDemoUser = (id: string) =>
  ['user-guest-demo', 'user-guest-calendar', 'user-demo-owner', 'user-demo-staff'].includes(id) || id.startsWith('user-demo-');
export const isDemoGuest = (id: string) => id === 'user-guest-demo' || id === 'user-guest-calendar' || id.startsWith('user-demo-guest-');
export const isDemoApplication = (id: string) => id === 'app-demo-owner' || id.startsWith('app-demo-');
