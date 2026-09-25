import { describe, expect, it } from "vitest";
import {
  SIGNUP_INVITE_TTL_SECONDS,
  decodeSignupInvite,
  encodeSignupInvite,
} from "./signup-invite-cookie";

const secret = "test-secret";
const now = Date.UTC(2026, 8, 25);

describe("signup invite cookie", () => {
  it("round-trips the invite id", () => {
    const value = encodeSignupInvite("invite-1", secret, now);
    expect(decodeSignupInvite(value, secret, now)).toBe("invite-1");
  });

  it("rejects a tampered invite id", () => {
    const value = encodeSignupInvite("invite-1", secret, now);
    const tampered = value.replace("invite-1", "invite-2");
    expect(decodeSignupInvite(tampered, secret, now)).toBeNull();
  });

  it("rejects an extended expiry", () => {
    const [id, exp, sig] = encodeSignupInvite("invite-1", secret, now).split(
      ".",
    );
    const extended = `${id}.${Number(exp) + 3600}.${sig}`;
    expect(decodeSignupInvite(extended, secret, now)).toBeNull();
  });

  it("rejects another secret, expired values, and junk", () => {
    const value = encodeSignupInvite("invite-1", secret, now);
    expect(decodeSignupInvite(value, "other-secret", now)).toBeNull();
    expect(
      decodeSignupInvite(value, secret, now + SIGNUP_INVITE_TTL_SECONDS * 1000),
    ).toBeNull();
    expect(decodeSignupInvite("invite-1", secret, now)).toBeNull();
    expect(decodeSignupInvite(undefined, secret, now)).toBeNull();
    expect(decodeSignupInvite(value, undefined, now)).toBeNull();
  });
});
