import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

/** Numbers typed without a +country code are read as this region. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "US";

/** Countries we will text verification codes to. Keep Twilio's Verify geo
 * permissions in sync, so a bug here can't run up an overseas SMS bill. */
export const SMS_COUNTRIES: readonly CountryCode[] = ["US", "TW"];

const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
const MIN_PHONE_DIGITS = 7;

/** True when a search query is shaped like a phone number, not an email or handle. */
export function looksLikePhone(raw: string): boolean {
  const q = raw.trim();
  if (!PHONE_CHARS_RE.test(q)) return false;
  return q.replace(/\D/g, "").length >= MIN_PHONE_DIGITS;
}

/** E.164 (e.g. +14155550123), or null when the input is not a valid number. */
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const q = raw.trim();
  if (!q || !PHONE_CHARS_RE.test(q)) return null;
  const parsed = parsePhoneNumberFromString(q, defaultCountry);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

/** Region of a stored E.164 number, used to read a searcher's local-format queries. */
export function phoneCountry(e164: string | null | undefined): CountryCode | undefined {
  if (!e164) return undefined;
  return parsePhoneNumberFromString(e164)?.country;
}

/** Readable international form for display, e.g. +1 415 555 0123. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

export function canTextPhone(e164: string): boolean {
  const country = phoneCountry(e164);
  return country !== undefined && SMS_COUNTRIES.includes(country);
}
