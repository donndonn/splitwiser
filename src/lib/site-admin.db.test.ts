import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  seedGroupWithInvite,
  seedUsers,
  setMaxUsers as seedMaxUsers,
  type TestDatabase,
} from "@/test/test-db";
import { admitNewUser } from "./admission";
import {
  deleteStalePendingUsers,
  getAdminGroup,
  getAdminOverview,
  listAdminGroups,
  listAdminUsers,
  listCurrentInvites,
  revokeInvite,
  setMaxUsers,
} from "./site-admin";

const actor = { id: "admin-user", email: "owner@example.test" };
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hasTestDatabase)("site admin", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.sql`truncate users, groups, invites, members, admin_actions cascade`;
    await t.sql`
      insert into app_settings (id, max_users) values (1, 500)
      on conflict (id) do update set max_users = 500
    `;
  });

  async function auditRows() {
    return t.sql`select action, actor_email, details from admin_actions order by created_at`;
  }

  describe("setMaxUsers", () => {
    it("updates the cap and records the change", async () => {
      const result = await setMaxUsers(t.db, { actor, maxUsers: 750 });
      expect(result).toEqual({ from: 500, to: 750, changed: true });
      const [row] = await t.sql`select max_users from app_settings`;
      expect(row.max_users).toBe(750);
      expect(await auditRows()).toEqual([
        {
          action: "set_max_users",
          actor_email: actor.email,
          details: { fromMaxUsers: 500, toMaxUsers: 750 },
        },
      ]);
    });

    it("does not log an unchanged cap", async () => {
      const result = await setMaxUsers(t.db, { actor, maxUsers: 500 });
      expect(result.changed).toBe(false);
      expect(await auditRows()).toEqual([]);
    });

    it("recreates a missing settings row", async () => {
      await t.sql`delete from app_settings`;
      const result = await setMaxUsers(t.db, { actor, maxUsers: 10 });
      expect(result).toEqual({ from: null, to: 10, changed: true });
      const rows = await t.sql`select id, max_users from app_settings`;
      expect(rows).toEqual([{ id: 1, max_users: 10 }]);
    });

    it("rejects invalid caps without writing", async () => {
      await expect(
        setMaxUsers(t.db, { actor, maxUsers: -1 }),
      ).rejects.toThrow(/whole number/);
      const [row] = await t.sql`select max_users from app_settings`;
      expect(row.max_users).toBe(500);
    });

    it("pausing blocks new signups", async () => {
      const { inviteId } = await seedGroupWithInvite(t.sql);
      await setMaxUsers(t.db, { actor, maxUsers: 0 });
      await expect(
        admitNewUser(t.db, { inviteId, profile: { email: "n@example.test" } }),
      ).rejects.toMatchObject({ reason: "full" });
    });
  });

  describe("deleteStalePendingUsers", () => {
    it("deletes only pending accounts older than the cutoff and frees their joins", async () => {
      const now = new Date();
      const { inviteId } = await seedGroupWithInvite(t.sql, { maxUses: 2 });
      const stale = await admitNewUser(t.db, {
        inviteId,
        profile: { email: "stale@example.test" },
        now,
      });
      const fresh = await admitNewUser(t.db, {
        inviteId,
        profile: { email: "fresh@example.test" },
        now,
      });
      await t.sql`
        update users set created_at = ${new Date(now.getTime() - 8 * DAY_MS).toISOString()}::timestamp
        where id = ${stale.id}
      `;
      // An old account that already joined is never touched.
      await seedUsers(t.sql, 1, "old");
      await t.sql`
        update users set created_at = ${new Date(now.getTime() - 90 * DAY_MS).toISOString()}::timestamp
        where id = 'old-1'
      `;

      const [before] = await listCurrentInvites(t.db, now);
      expect(before.status).toBe("used_up");

      const deleted = await deleteStalePendingUsers(t.db, { actor, now });
      expect(deleted).toEqual([stale.id]);

      const ids = (await t.sql`select id from users order by id`).map((r) => r.id);
      expect(ids).toContain(fresh.id);
      expect(ids).toContain("old-1");
      expect(ids).not.toContain(stale.id);

      const [after] = await listCurrentInvites(t.db, now);
      expect(after).toMatchObject({ reserved: 1, status: "live" });

      const [audit] = await auditRows();
      expect(audit).toMatchObject({
        action: "delete_stale_pending_users",
        details: { deletedUserIds: [stale.id], olderThanDays: 7 },
      });
    });

    it("does nothing and logs nothing when none are stale", async () => {
      await seedUsers(t.sql, 3);
      expect(await deleteStalePendingUsers(t.db, { actor })).toEqual([]);
      expect(await auditRows()).toEqual([]);
    });
  });

  describe("revokeInvite", () => {
    it("revokes a current link once and records the group", async () => {
      const { inviteId, groupId } = await seedGroupWithInvite(t.sql);
      expect(await revokeInvite(t.db, { actor, inviteId })).toBe(true);
      expect(await revokeInvite(t.db, { actor, inviteId })).toBe(false);

      const [row] = await t.sql`select revoked_at from invites where id = ${inviteId}`;
      expect(row.revoked_at).not.toBeNull();
      expect(await listCurrentInvites(t.db)).toEqual([]);

      const audit = await auditRows();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: "revoke_invite",
        details: { inviteId, groupId, groupName: "Trip" },
      });
    });

    it("rejects signups through a revoked link", async () => {
      const { inviteId } = await seedGroupWithInvite(t.sql);
      await revokeInvite(t.db, { actor, inviteId });
      await expect(
        admitNewUser(t.db, { inviteId, profile: { email: "n@example.test" } }),
      ).rejects.toMatchObject({ reason: "invite_unavailable" });
    });
  });

  describe("queries", () => {
    it("summarizes accounts against the cap", async () => {
      await seedMaxUsers(t.sql, 10);
      await seedUsers(t.sql, 3);
      const { inviteId } = await seedGroupWithInvite(t.sql);
      await admitNewUser(t.db, { inviteId, profile: { email: "p@example.test" } });

      expect(await getAdminOverview(t.db)).toEqual({
        total: 5,
        groups: 1,
        pending: 1,
        stalePending: 0,
        maxUsers: 10,
      });
    });

    it("searches, filters, and pages users", async () => {
      await seedUsers(t.sql, 60, "bulk");
      await t.sql`
        insert into users (id, name, email, username)
        values ('p1', 'Pat 100%', 'pat@example.test', 'patty')
      `;

      const first = await listAdminUsers(t.db, {});
      expect(first.users).toHaveLength(50);
      expect(first.hasNext).toBe(true);
      const second = await listAdminUsers(t.db, { page: 2 });
      expect(second.users).toHaveLength(11);
      expect(second.hasNext).toBe(false);

      const pending = await listAdminUsers(t.db, { status: "pending" });
      expect(pending.users.map((u) => u.id)).toEqual(["p1"]);

      // LIKE wildcards in the query are literal.
      const literal = await listAdminUsers(t.db, { query: "100%" });
      expect(literal.users.map((u) => u.id)).toEqual(["p1"]);
      const wildcard = await listAdminUsers(t.db, { query: "%" });
      expect(wildcard.users.map((u) => u.id)).toEqual(["p1"]);

      const byUsername = await listAdminUsers(t.db, { query: "PATTY" });
      expect(byUsername.users.map((u) => u.id)).toEqual(["p1"]);
    });

    it("summarizes each group", async () => {
      const trip = await seedGroupWithInvite(t.sql);
      const empty = await seedGroupWithInvite(t.sql);
      await t.sql`update groups set name = 'Empty 50%' where id = ${empty.groupId}`;
      await t.sql`
        insert into members (id, group_id, user_id, display_name) values
          ('ph-1', ${trip.groupId}, null, 'Placeholder A'),
          ('ph-2', ${trip.groupId}, null, 'Placeholder B')
      `;
      await t.sql`
        insert into expenses (id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id, spent_at)
        values
          ('e1', ${trip.groupId}, 'Dinner', 12345, ${trip.adminMemberId}, ${trip.adminMemberId}, '2026-09-01'),
          ('e2', ${trip.groupId}, 'Taxi', 655, 'ph-1', ${trip.adminMemberId}, '2026-09-03')
      `;
      await t.sql`
        insert into group_activities (id, group_id, type, payload, created_at)
        values ('a1', ${trip.groupId}, 'member_joined', '{"actorName":"A"}', '2026-09-04')
      `;
      const { adminUserId } = trip;

      const { groups } = await listAdminGroups(t.db, {});
      const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
      expect(byId[trip.groupId]).toMatchObject({
        accounts: 1,
        placeholders: 2,
        expenseCount: 2,
        totalCents: 13000,
        lastActivityAt: new Date("2026-09-04T00:00:00Z"),
      });
      expect(byId[empty.groupId]).toMatchObject({
        accounts: 1,
        placeholders: 0,
        expenseCount: 0,
        totalCents: 0,
        lastActivityAt: null,
      });

      const search = await listAdminGroups(t.db, { query: "50%" });
      expect(search.groups.map((g) => g.id)).toEqual([empty.groupId]);

      const detail = await getAdminGroup(t.db, trip.groupId);
      expect(detail).toMatchObject({
        expenseCount: 2,
        totalCents: 13000,
        lastSpentAt: new Date("2026-09-03T00:00:00Z"),
        lastActivityAt: new Date("2026-09-04T00:00:00Z"),
        invite: { uses: 0, maxUses: 15, reserved: 0, status: "live" },
      });
      expect(detail?.members.map((m) => [m.displayName, m.email])).toEqual([
        ["Admin", `${adminUserId}@example.test`],
        ["Placeholder A", null],
        ["Placeholder B", null],
      ]);
      expect(await getAdminGroup(t.db, "missing")).toBeNull();
    });

    it("counts each user's groups", async () => {
      const { adminUserId, groupId } = await seedGroupWithInvite(t.sql);
      const second = await seedGroupWithInvite(t.sql);
      await t.sql`
        insert into members (id, group_id, user_id, display_name)
        values ('extra-1', ${second.groupId}, ${adminUserId}, 'Also admin'),
               ('extra-2', ${groupId}, null, 'Placeholder')
      `;
      await seedUsers(t.sql, 1, "lonely");

      const { users } = await listAdminUsers(t.db, {});
      const counts = Object.fromEntries(users.map((u) => [u.id, u.groupCount]));
      expect(counts).toEqual({
        [adminUserId]: 2,
        [second.adminUserId]: 1,
        "lonely-1": 0,
      });
    });
  });
});
