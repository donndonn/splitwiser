import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  linkPlaceholderToUser,
  listLinkCandidates,
} from "@/lib/placeholder-links";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

describe.skipIf(!hasTestDatabase)("linking placeholders to accounts", () => {
  let t: TestDatabase;

  const actor = { userId: "vince", memberId: "ski-vince", displayName: "Vince" };

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    await t.sql`
      insert into users (id, name, username, onboarding_completed_at) values
        ('vince', 'Vince', 'vince', now()),
        ('sam', 'Sam Lee', 'samlee', now()),
        ('fran', 'Fran', null, now()),
        ('stranger', 'Sam Stranger', null, now())
    `;
    await t.sql`insert into users (id, name) values ('pending', 'Sam Pending')`;
    await t.sql`
      insert into friendships (id, user_id_a, user_id_b) values ('f1', 'fran', 'vince')
    `;
    await t.sql`
      insert into groups (id, name) values
        ('trip', 'Trip'), ('ski', 'Ski Weekend'), ('other', 'Other')
    `;
    await t.sql`
      insert into members (id, group_id, user_id, display_name, is_admin) values
        ('trip-vince', 'trip', 'vince', 'Vince', true),
        ('trip-sam', 'trip', 'sam', 'Sam', false),
        ('trip-pending', 'trip', 'pending', 'Sam P', false),
        ('ski-vince', 'ski', 'vince', 'Vince', true),
        ('ski-sam', 'ski', null, 'Sam', false),
        ('ski-fran', 'ski', null, 'Fran', false),
        ('other-stranger', 'other', 'stranger', 'Sam S', true)
    `;
    await t.sql`
      insert into expenses (
        id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id
      ) values ('lift', 'ski', 'Lift tickets', 6000, 'ski-vince', 'ski-vince')
    `;
    await t.sql`
      insert into expense_splits (expense_id, member_id, amount_cents) values
        ('lift', 'ski-vince', 3000), ('lift', 'ski-sam', 3000)
    `;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("offers friends and people from other groups, not strangers or pending signups", async () => {
    const candidates = await listLinkCandidates(t.db, {
      userId: "vince",
      groupId: "ski",
    });
    expect(candidates.map((c) => c.id)).toEqual(["fran", "sam"]);
    expect(candidates.find((c) => c.id === "sam")).toMatchObject({
      isFriend: false,
      sharedGroups: ["Trip"],
    });
    expect(candidates.find((c) => c.id === "fran")).toMatchObject({
      isFriend: true,
      sharedGroups: [],
    });
  });

  it("links the placeholder, keeping its name and expenses", async () => {
    const result = await linkPlaceholderToUser(t.db, {
      groupId: "ski",
      memberId: "ski-sam",
      targetUserId: "sam",
      actor,
    });
    expect(result).toEqual({ displayName: "Sam" });
    const [member] = await t.sql`
      select user_id, display_name from members where id = 'ski-sam'
    `;
    expect(member).toEqual({ user_id: "sam", display_name: "Sam" });
    const [split] = await t.sql`
      select amount_cents from expense_splits where member_id = 'ski-sam'
    `;
    expect(Number(split.amount_cents)).toBe(3000);
    const [activity] = await t.sql`
      select type, payload from group_activities
      where group_id = 'ski' order by created_at desc limit 1
    `;
    expect(activity.type).toBe("member_joined");
    expect(activity.payload).toMatchObject({
      actorName: "Vince",
      memberName: "Sam",
    });

    const after = await listLinkCandidates(t.db, {
      userId: "vince",
      groupId: "ski",
    });
    expect(after.map((c) => c.id)).toEqual(["fran"]);
  });

  it("refuses accounts already in the group and people the admin doesn't know", async () => {
    await expect(
      linkPlaceholderToUser(t.db, {
        groupId: "ski",
        memberId: "ski-fran",
        targetUserId: "sam",
        actor,
      }),
    ).rejects.toThrow(/friends or people who share a group/);
    await expect(
      linkPlaceholderToUser(t.db, {
        groupId: "ski",
        memberId: "ski-fran",
        targetUserId: "stranger",
        actor,
      }),
    ).rejects.toThrow(/friends or people who share a group/);
  });

  it("refuses a member that is already linked", async () => {
    await expect(
      linkPlaceholderToUser(t.db, {
        groupId: "ski",
        memberId: "ski-sam",
        targetUserId: "fran",
        actor,
      }),
    ).rejects.toThrow(/no longer available/);
  });
});
