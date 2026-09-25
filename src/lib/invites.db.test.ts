import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  seedGroupWithInvite,
  setMaxUsers,
  type TestDatabase,
} from "@/test/test-db";
import {
  INVITE_MAX_USES,
  InviteUnavailableError,
  changeGroupInviteLink,
  joinGroupWithInvite,
} from "./invites";

describe.skipIf(!hasTestDatabase)("group invitations", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.sql`truncate users, groups, invites, members, group_activities cascade`;
    await setMaxUsers(t.sql, 500);
  });

  async function pendingUser(id: string) {
    await t.sql`insert into users (id, email) values (${id}, ${`${id}@example.test`})`;
    return id;
  }

  async function uses(inviteId: string) {
    const [row] = await t.sql`select uses from invites where id = ${inviteId}`;
    return row.uses as number;
  }

  async function onboarded(userId: string) {
    const [row] = await t.sql`
      select onboarding_completed_at from users where id = ${userId}
    `;
    return row.onboarding_completed_at != null;
  }

  async function memberCount(groupId: string, userId: string) {
    const [row] = await t.sql`
      select count(*)::int as count from members
      where group_id = ${groupId} and user_id = ${userId}
    `;
    return row.count as number;
  }

  describe("joining", () => {
    it("joins, consumes one use, completes onboarding, and logs activity", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const userId = await pendingUser("pending");
      const result = await joinGroupWithInvite(t.db, {
        token: g.token,
        userId,
        choice: { kind: "new", displayName: "Pat" },
      });
      expect(result).toEqual({ groupId: g.groupId, joined: true });
      expect(await uses(g.inviteId)).toBe(1);
      expect(await onboarded(userId)).toBe(true);
      const activity = await t.sql`
        select type from group_activities where group_id = ${g.groupId}
      `;
      expect(activity.map((a) => a.type)).toEqual(["member_joined"]);
    });

    it("does not consume uses for repeated or concurrent submissions", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const userId = await pendingUser("pending");
      const pools = Array.from({ length: 4 }, () => t.connect(1));
      await Promise.all(
        pools.map(({ db }) =>
          joinGroupWithInvite(db, {
            token: g.token,
            userId,
            choice: { kind: "new", displayName: "Pat" },
          }),
        ),
      );
      await joinGroupWithInvite(t.db, {
        token: g.token,
        userId,
        choice: { kind: "new", displayName: "Pat" },
      });
      expect(await uses(g.inviteId)).toBe(1);
      expect(await memberCount(g.groupId, userId)).toBe(1);
    });

    it("lets existing members through old links without consuming uses", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await t.sql`update invites set revoked_at = now() where id = ${g.inviteId}`;
      const result = await joinGroupWithInvite(t.db, {
        token: g.token,
        userId: g.adminUserId,
        choice: { kind: "new", displayName: "Admin" },
      });
      expect(result).toEqual({ groupId: g.groupId, joined: false });
      expect(await uses(g.inviteId)).toBe(0);
    });

    it("consumes a use for an already-onboarded app user", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await t.sql`
        insert into users (id, email, onboarding_completed_at)
        values ('veteran', 'veteran@example.test', now())
      `;
      await joinGroupWithInvite(t.db, {
        token: g.token,
        userId: "veteran",
        choice: { kind: "new", displayName: "Vet" },
      });
      expect(await uses(g.inviteId)).toBe(1);
    });

    it("consumes a use when claiming a placeholder", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await t.sql`
        insert into members (id, group_id, display_name)
        values ('placeholder', ${g.groupId}, 'Sam')
      `;
      const userId = await pendingUser("sam");
      await joinGroupWithInvite(t.db, {
        token: g.token,
        userId,
        choice: { kind: "claim", memberId: "placeholder" },
      });
      const [member] = await t.sql`select user_id from members where id = 'placeholder'`;
      expect(member.user_id).toBe(userId);
      expect(await uses(g.inviteId)).toBe(1);
      expect(await onboarded(userId)).toBe(true);
    });

    it("consumes another use on leave and rejoin, and keeps onboarding", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const userId = await pendingUser("pending");
      const join = () =>
        joinGroupWithInvite(t.db, {
          token: g.token,
          userId,
          choice: { kind: "new", displayName: "Pat" },
        });
      await join();
      await t.sql`delete from members where group_id = ${g.groupId} and user_id = ${userId}`;
      expect(await onboarded(userId)).toBe(true);
      await join();
      expect(await uses(g.inviteId)).toBe(2);
    });

    it("rejects expired and exhausted invitations", async () => {
      const userId = await pendingUser("pending");
      for (const options of [
        { expiresAt: new Date(Date.now() - 1000) },
        { uses: INVITE_MAX_USES },
      ]) {
        const g = await seedGroupWithInvite(t.sql, options);
        await expect(
          joinGroupWithInvite(t.db, {
            token: g.token,
            userId,
            choice: { kind: "new", displayName: "Pat" },
          }),
        ).rejects.toBeInstanceOf(InviteUnavailableError);
      }
      expect(await onboarded(userId)).toBe(false);
    });

    it("treats the expiry instant as expired", async () => {
      const expiresAt = new Date("2026-10-01T00:00:00Z");
      const g = await seedGroupWithInvite(t.sql, { expiresAt });
      const userId = await pendingUser("pending");
      const attempt = (now: Date) =>
        joinGroupWithInvite(t.db, {
          token: g.token,
          userId,
          choice: { kind: "new", displayName: "Pat" },
          now,
        });
      await expect(attempt(expiresAt)).rejects.toBeInstanceOf(
        InviteUnavailableError,
      );
      await expect(
        attempt(new Date(expiresAt.getTime() - 1)),
      ).resolves.toMatchObject({ joined: true });
    });

    it("lets a pending account finish joining at global capacity", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const userId = await pendingUser("pending");
      await setMaxUsers(t.sql, 2);
      await expect(
        joinGroupWithInvite(t.db, {
          token: g.token,
          userId,
          choice: { kind: "new", displayName: "Pat" },
        }),
      ).resolves.toMatchObject({ joined: true });
    });

    it("admits exactly one of many concurrent joins at 14 of 15", async () => {
      const g = await seedGroupWithInvite(t.sql, { uses: 14 });
      const ids = await Promise.all(
        Array.from({ length: 6 }, (_, i) => pendingUser(`racer-${i}`)),
      );
      const results = await Promise.allSettled(
        ids.map((userId, i) =>
          joinGroupWithInvite(t.connect(1).db, {
            token: g.token,
            userId,
            choice: { kind: "new", displayName: `Racer ${i}` },
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await uses(g.inviteId)).toBe(15);
    });

    it("never admits through a link after its reset commits", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const userId = await pendingUser("pending");

      // Hold the reset transaction open with the invitation locked, start a
      // join (which must wait), then commit the reset.
      const resetPool = t.connect(1);
      let releaseReset!: () => void;
      const resetGate = new Promise<void>((resolve) => (releaseReset = resolve));
      let lockedResolve!: () => void;
      const locked = new Promise<void>((resolve) => (lockedResolve = resolve));

      const reset = resetPool.sql.begin(async (tx) => {
        await tx`select id from invites where id = ${g.inviteId} for update`;
        await tx`update invites set revoked_at = now() where id = ${g.inviteId}`;
        lockedResolve();
        await resetGate;
      });

      await locked;
      const join = joinGroupWithInvite(t.connect(1).db, {
        token: g.token,
        userId,
        choice: { kind: "new", displayName: "Pat" },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseReset();
      await reset;

      await expect(join).rejects.toBeInstanceOf(InviteUnavailableError);
      expect(await memberCount(g.groupId, userId)).toBe(0);
      expect(await uses(g.inviteId)).toBe(0);
    });
  });

  describe("link management", () => {
    async function currentInvites(groupId: string) {
      return t.sql`
        select id, token, max_uses,
          extract(epoch from expires_at - created_at)::int as ttl_seconds
        from invites
        where group_id = ${groupId} and revoked_at is null
      `;
    }

    it("creates a 30-day, 15-join link and reuses it while live", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await t.sql`update invites set revoked_at = now() where id = ${g.inviteId}`;
      const now = new Date("2026-09-25T00:00:00Z");
      const first = await changeGroupInviteLink(t.db, {
        groupId: g.groupId,
        actorMemberId: g.adminMemberId,
        change: "create",
        now,
      });
      const again = await changeGroupInviteLink(t.db, {
        groupId: g.groupId,
        actorMemberId: g.adminMemberId,
        change: "create",
        now,
      });
      expect(again.token).toBe(first.token);
      const [current] = await currentInvites(g.groupId);
      expect(current.max_uses).toBe(15);
      expect(current.ttl_seconds).toBe(30 * 24 * 60 * 60);
    });

    it("replaces an exhausted link on create", async () => {
      const g = await seedGroupWithInvite(t.sql, { uses: 15 });
      const { token } = await changeGroupInviteLink(t.db, {
        groupId: g.groupId,
        actorMemberId: g.adminMemberId,
        change: "create",
      });
      expect(token).not.toBe(g.token);
      const current = await currentInvites(g.groupId);
      expect(current.map((r) => r.token)).toEqual([token]);
    });

    it("resets and disables while keeping history", async () => {
      const g = await seedGroupWithInvite(t.sql);
      const reset = await changeGroupInviteLink(t.db, {
        groupId: g.groupId,
        actorMemberId: g.adminMemberId,
        change: "reset",
      });
      expect(reset).toMatchObject({ replaced: true });
      expect(reset.token).not.toBe(g.token);

      const disabled = await changeGroupInviteLink(t.db, {
        groupId: g.groupId,
        actorMemberId: g.adminMemberId,
        change: "disable",
      });
      expect(disabled.token).toBeNull();
      expect(await currentInvites(g.groupId)).toHaveLength(0);
      const [{ count }] = await t.sql`
        select count(*)::int as count from invites where group_id = ${g.groupId}
      `;
      expect(count).toBe(2);
    });

    it("serializes concurrent creation into one current link", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await t.sql`update invites set revoked_at = now() where id = ${g.inviteId}`;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          changeGroupInviteLink(t.connect(1).db, {
            groupId: g.groupId,
            actorMemberId: g.adminMemberId,
            change: "create",
          }),
        ),
      );
      expect(new Set(results.map((r) => r.token)).size).toBe(1);
      expect(await currentInvites(g.groupId)).toHaveLength(1);
    });

    it("rejects a second current link at the database", async () => {
      const g = await seedGroupWithInvite(t.sql);
      await expect(t.sql`
        insert into invites (id, group_id, token, created_by_member_id)
        values ('dup', ${g.groupId}, 'dup-token', ${g.adminMemberId})
      `).rejects.toThrow(/invites_group_current_unique/);
    });
  });
});
