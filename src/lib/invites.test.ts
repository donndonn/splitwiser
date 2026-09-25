import { describe, expect, it } from "vitest";
import { inviteStatus } from "./invites";

const now = new Date("2026-09-25T12:00:00Z");
const base = { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 };

describe("inviteStatus", () => {
  it("is live before expiry and under the join limit", () => {
    expect(
      inviteStatus(
        { ...base, expiresAt: new Date(now.getTime() + 1), maxUses: 15, uses: 14 },
        now,
      ),
    ).toBe("live");
  });

  it("expires exactly at expiresAt", () => {
    expect(inviteStatus({ ...base, expiresAt: now }, now)).toBe("expired");
  });

  it("is used up at maxUses", () => {
    expect(inviteStatus({ ...base, maxUses: 15, uses: 15 }, now)).toBe(
      "used_up",
    );
  });

  it("reports revocation first", () => {
    expect(
      inviteStatus({ ...base, revokedAt: now, maxUses: 1, uses: 1 }, now),
    ).toBe("revoked");
  });
});
