import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBalancesByGroup,
  listViewerGroupSummaries,
} from "@/lib/balances";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

function nets(rows: { memberId: string; netCents: number }[] | undefined) {
  return Object.fromEntries((rows ?? []).map((row) => [row.memberId, row.netCents]));
}

describe.skipIf(!hasTestDatabase)("soft-deleted expenses are excluded from balances", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    await t.sql`
      insert into users (id, name, onboarding_completed_at)
      values ('u1', 'Ada', now())
    `;
    await t.sql`insert into groups (id, name, currency) values ('g1', 'Trip', 'USD')`;
    await t.sql`
      insert into members (id, group_id, user_id, display_name) values
        ('m1', 'g1', 'u1', 'Ada'),
        ('m2', 'g1', null, 'Bea')
    `;
    await t.sql`
      insert into expenses (
        id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id
      ) values
        ('live', 'g1', 'Snacks', 200, 'm1', 'm1'),
        ('gone', 'g1', 'Dinner', 1000, 'm1', 'm1')
    `;
    await t.sql`
      insert into expense_splits (expense_id, member_id, amount_cents) values
        ('live', 'm1', 100), ('live', 'm2', 100),
        ('gone', 'm1', 400), ('gone', 'm2', 600)
    `;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("drops a deleted expense from group and home nets, then counts it again after restore", async () => {
    expect(nets((await getBalancesByGroup(["g1"], t.db)).get("g1"))).toEqual({
      m1: 700,
      m2: -700,
    });

    await t.sql`
      update expenses
      set deleted_at = now(), deleted_by_member_id = 'm1'
      where id = 'gone'
    `;

    expect(nets((await getBalancesByGroup(["g1"], t.db)).get("g1"))).toEqual({
      m1: 100,
      m2: -100,
    });
    expect(await listViewerGroupSummaries("u1", t.db)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        memberId: "m1",
        netCents: 100,
      }),
    ]);

    await t.sql`
      update expenses
      set deleted_at = null, deleted_by_member_id = null
      where id = 'gone'
    `;

    expect(nets((await getBalancesByGroup(["g1"], t.db)).get("g1"))).toEqual({
      m1: 700,
      m2: -700,
    });
    expect(await listViewerGroupSummaries("u1", t.db)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        memberId: "m1",
        netCents: 700,
      }),
    ]);
  });
});
