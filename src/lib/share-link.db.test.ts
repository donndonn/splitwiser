import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeGroupShareLink, getSharedGroupView } from "@/lib/share-link";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

describe.skipIf(!hasTestDatabase)("read-only share links", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    await t.sql`
      insert into users (id, name, venmo_username, onboarding_completed_at)
      values ('u1', 'Ada', 'ada-v', now())
    `;
    await t.sql`insert into groups (id, name, currency) values ('g1', 'Dinner', 'USD')`;
    await t.sql`insert into groups (id, name, currency) values ('g2', 'Other', 'USD')`;
    await t.sql`
      insert into members (id, group_id, user_id, display_name, is_admin) values
        ('m1', 'g1', 'u1', 'Ada', true),
        ('m2', 'g1', null, 'Bea', false)
    `;
    await t.sql`
      insert into expenses (
        id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id
      ) values
        ('live', 'g1', 'Tacos', 3000, 'm1', 'm1'),
        ('gone', 'g1', 'Deleted', 1000, 'm1', 'm1')
    `;
    await t.sql`update expenses set deleted_at = now(), deleted_by_member_id = 'm1' where id = 'gone'`;
    await t.sql`
      insert into expense_splits (expense_id, member_id, amount_cents) values
        ('live', 'm1', 1000), ('live', 'm2', 2000),
        ('gone', 'm1', 500), ('gone', 'm2', 500)
    `;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("is off until created, then reuses the token on create", async () => {
    expect(await getSharedGroupView(t.db, "")).toBeNull();

    const token = await changeGroupShareLink(t.db, {
      groupId: "g1",
      change: "create",
    });
    expect(token).toMatch(/^[\w-]{24}$/);
    expect(
      await changeGroupShareLink(t.db, { groupId: "g1", change: "create" }),
    ).toBe(token);
  });

  it("shows members, live expenses with splits, and balances", async () => {
    const token = await changeGroupShareLink(t.db, {
      groupId: "g1",
      change: "create",
    });
    const view = await getSharedGroupView(t.db, token!);

    expect(view?.group).toEqual({ id: "g1", name: "Dinner", currency: "USD" });
    expect(view?.members).toEqual([
      { id: "m1", displayName: "Ada", netCents: 2000 },
      { id: "m2", displayName: "Bea", netCents: -2000 },
    ]);
    expect(view?.expenses).toEqual([
      expect.objectContaining({
        id: "live",
        paidByName: "Ada",
        amountCents: 3000,
        shares: { m1: 1000, m2: 2000 },
      }),
    ]);
    expect(view?.suggestions).toEqual([
      { fromMemberId: "m2", toMemberId: "m1", amountCents: 2000 },
    ]);
    expect(view?.venmoUsernameByMemberId.get("m1")).toBe("ada-v");
  });

  it("stops the old link on reset and all links on disable", async () => {
    const before = await changeGroupShareLink(t.db, {
      groupId: "g1",
      change: "create",
    });
    const after = await changeGroupShareLink(t.db, {
      groupId: "g1",
      change: "reset",
    });
    expect(after).not.toBe(before);
    expect(await getSharedGroupView(t.db, before!)).toBeNull();
    expect((await getSharedGroupView(t.db, after!))?.group.id).toBe("g1");

    expect(
      await changeGroupShareLink(t.db, { groupId: "g1", change: "disable" }),
    ).toBeNull();
    expect(await getSharedGroupView(t.db, after!)).toBeNull();
  });
});
