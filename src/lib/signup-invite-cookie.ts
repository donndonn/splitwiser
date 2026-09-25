import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Carries the invitation that authorizes a new account through the OAuth
 * round trip. Holds only the invite id (never its token), expires quickly,
 * and is HMAC-signed with AUTH_SECRET so it cannot be forged or edited.
 */
export const SIGNUP_INVITE_COOKIE = "sw-signup-invite";
export const SIGNUP_INVITE_TTL_SECONDS = 15 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`signup-invite:${payload}`)
    .digest("base64url");
}

export function encodeSignupInvite(
  inviteId: string,
  secret: string,
  nowMs: number = Date.now(),
): string {
  const exp = Math.floor(nowMs / 1000) + SIGNUP_INVITE_TTL_SECONDS;
  const payload = `${inviteId}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the invite id, or null when missing, expired, or tampered. */
export function decodeSignupInvite(
  value: string | null | undefined,
  secret: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [inviteId, expRaw, signature] = parts;
  const expected = Buffer.from(sign(`${inviteId}.${expRaw}`, secret));
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return null;
  return inviteId || null;
}

/**
 * Apple returns with a cross-site form POST, so production needs
 * SameSite=None (which requires Secure). Apple is production-only.
 */
export function signupInviteCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: SIGNUP_INVITE_TTL_SECONDS,
  };
}
