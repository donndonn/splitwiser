import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, sql as dsql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, users, verificationTokens } from "@/db/schema";
import {
  createTestDatabase,
  hasTestDatabase,
  seedGroupWithInvite,
  seedUsers,
  setMaxUsers,
  type TestDatabase,
} from "@/test/test-db";
import { AdmissionError, admitNewUser } from "./admission";
import {
  createUserWithAdmission,
  withAuthRequestContext,
} from "./auth-request-context";
import { SIGNUP_INVITE_COOKIE, encodeSignupInvite } from "./signup-invite-cookie";

const SECRET = "admission-test-secret";

describe.skipIf(!hasTestDatabase)("account admission", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await t.sql`truncate users, groups, invites, members cascade`;
    await setMaxUsers(t.sql, 500);
  });

  async function userCount() {
    const [{ count }] = await t.sql<{ count: number }[]>`
      select count(*)::int as count from users
    `;
    return count;
  }

  async function expectRejected(
    inviteId: string | null,
    reason: AdmissionError["reason"],
  ) {
    const before = await userCount();
    await expect(
      admitNewUser(t.db, { inviteId, profile: { email: "new@example.test" } }),
    ).rejects.toMatchObject({ reason });
    expect(await userCount()).toBe(before);
  }

  it("creates a pending account that reserves, but does not use, a join", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql);
    const user = await admitNewUser(t.db, {
      inviteId,
      profile: { name: "New", email: "new@example.test" },
    });
    expect(user.onboardingCompletedAt).toBeNull();
    expect(user.signupInviteId).toBe(inviteId);
    const [invite] = await t.sql`select uses from invites where id = ${inviteId}`;
    expect(invite.uses).toBe(0);
  });

  it("admits at most the link's allowance of accounts, counting pending signups", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql, { uses: 10 });
    for (let i = 0; i < 5; i++) {
      await admitNewUser(t.db, {
        inviteId,
        profile: { email: `pending-${i}@example.test` },
      });
    }
    // 10 joins + 5 pending reservations fill the 15-join allowance.
    await expectRejected(inviteId, "invite_unavailable");

    // A pending signup that finishes joining elsewhere frees its reservation.
    await t.sql`
      update users set onboarding_completed_at = now()
      where email = 'pending-0@example.test'
    `;
    await admitNewUser(t.db, {
      inviteId,
      profile: { email: "late@example.test" },
    });
  });

  it("admits exactly one of many concurrent signups for the last free join", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql, { uses: 14 });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        admitNewUser(t.connect(1).db, {
          inviteId,
          profile: { email: `link-racer-${i}@example.test` },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason.reason).toBe("invite_unavailable");
      }
    }
  });

  it("rejects signup without invitation context", async () => {
    await expectRejected(null, "invite_required");
  });

  it("rejects missing, expired, revoked, and exhausted invitations", async () => {
    await expectRejected("no-such-invite", "invite_unavailable");

    const expired = await seedGroupWithInvite(t.sql, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await expectRejected(expired.inviteId, "invite_unavailable");

    const exhausted = await seedGroupWithInvite(t.sql, { uses: 15 });
    await expectRejected(exhausted.inviteId, "invite_unavailable");

    const revoked = await seedGroupWithInvite(t.sql);
    await t.sql`update invites set revoked_at = now() where id = ${revoked.inviteId}`;
    await expectRejected(revoked.inviteId, "invite_unavailable");
  });

  it("enforces the cap, and raising or lowering it takes effect immediately", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql); // 1 user
    await seedUsers(t.sql, 3); // 4 users
    await setMaxUsers(t.sql, 4);
    await expectRejected(inviteId, "full");

    await setMaxUsers(t.sql, 5);
    await admitNewUser(t.db, { inviteId, profile: { email: "a@example.test" } });
    expect(await userCount()).toBe(5);

    await setMaxUsers(t.sql, 2);
    expect(await userCount()).toBe(5);
    await expectRejected(inviteId, "full");

    await setMaxUsers(t.sql, 0);
    await expectRejected(inviteId, "full");
  });

  it("rejects new accounts when the settings row is missing", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql);
    await t.sql`delete from app_settings`;
    try {
      await expectRejected(inviteId, "closed");
    } finally {
      await t.sql`insert into app_settings (id, max_users) values (1, 500)`;
    }
  });

  it("admits exactly one of many concurrent signups at 499 of 500", async () => {
    const { inviteId } = await seedGroupWithInvite(t.sql); // 1 user
    await seedUsers(t.sql, 498); // 499 users
    await setMaxUsers(t.sql, 500);

    const racers = Array.from({ length: 8 }, () => t.connect(1));
    const results = await Promise.allSettled(
      racers.map(({ db }, i) =>
        admitNewUser(db, {
          inviteId,
          profile: { email: `racer-${i}@example.test` },
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(AdmissionError);
        expect(r.reason.reason).toBe("full");
      }
    }
    expect(await userCount()).toBe(500);
  });

  it("lets existing accounts sign in and link providers at capacity", async () => {
    await seedGroupWithInvite(t.sql);
    const [{ id }] = await t.sql`
      insert into users (id, email, onboarding_completed_at)
      values ('existing', 'existing@example.test', now()) returning id
    `;
    await setMaxUsers(t.sql, 0);

    const adapter = DrizzleAdapter(t.db, {
      usersTable: users,
      accountsTable: accounts,
      verificationTokensTable: verificationTokens,
    });
    const found = await adapter.getUserByEmail!("existing@example.test");
    expect(found?.id).toBe(id);
    await adapter.linkAccount!({
      userId: id,
      type: "oidc",
      provider: "apple",
      providerAccountId: "apple-sub",
    });
    const linked = await adapter.getUserByAccount!({
      provider: "apple",
      providerAccountId: "apple-sub",
    });
    expect(linked?.id).toBe(id);
    expect(await userCount()).toBe(2);
  });

  describe("auth route context", () => {
    function authRequest(cookie?: string) {
      return new Request("https://splitwiser.example/api/auth/callback/google", {
        headers: cookie ? { cookie } : {},
      });
    }

    // Stands in for Auth.js: a new OAuth identity reaches the adapter's
    // createUser, and a thrown error becomes a generic error redirect.
    async function simulateCallback(request: Request) {
      return withAuthRequestContext(
        request,
        async () => {
          try {
            await createUserWithAdmission(t.db, { email: "direct@example.test" });
            return Response.redirect("https://splitwiser.example/join/x", 302);
          } catch {
            return Response.redirect(
              "https://splitwiser.example/signin?error=Configuration",
              302,
            );
          }
        },
        SECRET,
      );
    }

    it("rejects a direct callback with no invitation cookie", async () => {
      const response = await simulateCallback(authRequest());
      expect(response.headers.get("location")).toBe(
        "https://splitwiser.example/signin?error=invite_required",
      );
      expect(await userCount()).toBe(0);
    });

    it("rejects a tampered invitation cookie", async () => {
      const { inviteId } = await seedGroupWithInvite(t.sql);
      const forged = encodeSignupInvite(inviteId, "wrong-secret");
      const response = await simulateCallback(
        authRequest(`${SIGNUP_INVITE_COOKIE}=${forged}`),
      );
      expect(response.headers.get("location")).toContain("error=invite_required");
      expect(await userCount()).toBe(1);
    });

    it("reports capacity failures from the final check", async () => {
      const { inviteId } = await seedGroupWithInvite(t.sql);
      await setMaxUsers(t.sql, 1);
      const cookie = encodeSignupInvite(inviteId, SECRET);
      const response = await simulateCallback(
        authRequest(`${SIGNUP_INVITE_COOKIE}=${cookie}`),
      );
      expect(response.headers.get("location")).toContain("error=full");
    });

    it("creates the account with a valid signed invitation", async () => {
      const { inviteId } = await seedGroupWithInvite(t.sql);
      const cookie = encodeSignupInvite(inviteId, SECRET);
      const response = await simulateCallback(
        authRequest(`${SIGNUP_INVITE_COOKIE}=${cookie}`),
      );
      expect(response.headers.get("location")).toBe(
        "https://splitwiser.example/join/x",
      );
      const [created] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, "direct@example.test"));
      expect(created.signupInviteId).toBe(inviteId);
      expect(created.onboardingCompletedAt).toBeNull();
      const [{ total }] = await t.db
        .select({ total: dsql<number>`count(*)::int` })
        .from(users);
      expect(total).toBe(2);
    });
  });
});
