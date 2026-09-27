import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";
import {
  generateDueRecurringExpenses,
  setExpenseRecurrence,
} from "./recurring-expenses";

const noon = (date: string) => new Date(`${date}T12:00:00.000Z`);

describe.skipIf(!hasTestDatabase)("recurring expenses", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.sql`truncate groups, members, expenses, recurring_expenses, group_activities cascade`;
    await t.sql`insert into groups (id, name) values ('g1', 'Home')`;
    await t.sql`
      insert into members (id, group_id, display_name, is_admin) values
        ('m1', 'g1', 'Ana', true),
        ('m2', 'g1', 'Ben', false)
    `;
  });

  async function seedRent(spentAt: Date) {
    await t.sql`
      insert into expenses (id, group_id, description, amount_cents, paid_by_member_id,
        spent_at, split_mode, notes, receipt_blob_pathname, created_by_member_id)
      values ('rent-1', 'g1', 'Rent', 200000, 'm1', ${spentAt.toISOString()}::timestamp,
        'shares', 'Apt 4', 'receipts/g1/rent-1.jpg', 'm1')
    `;
    await t.sql`
      insert into expense_splits (expense_id, member_id, amount_cents, weight) values
        ('rent-1', 'm1', 120000, 3), ('rent-1', 'm2', 80000, 2)
    `;
  }

  async function rentRows() {
    return t.sql`
      select id, spent_at::text as spent_at, amount_cents, notes, receipt_blob_pathname, split_mode
      from expenses order by spent_at
    `;
  }

  it("creates due occurrences, copies splits, and moves the template forward", async () => {
    await seedRent(noon("2026-07-01"));
    await setExpenseRecurrence(t.db, {
      groupId: "g1",
      expenseId: "rent-1",
      spentAt: noon("2026-07-01"),
      repeat: "monthly",
      actorMemberId: "m1",
    });

    const result = await generateDueRecurringExpenses(t.db, noon("2026-09-02"));
    expect(result).toEqual({ created: 2, groupIds: ["g1"], failed: 0 });

    const rows = await rentRows();
    expect(rows.map((r) => r.spent_at)).toEqual([
      "2026-07-01 12:00:00",
      "2026-08-01 12:00:00",
      "2026-09-01 12:00:00",
    ]);
    expect(rows[2].notes).toBe("Apt 4");
    expect(rows[2].split_mode).toBe("shares");
    expect(rows[2].receipt_blob_pathname).toBeNull();

    const splits = await t.sql`
      select member_id, amount_cents::int as amount_cents, weight::float as weight
      from expense_splits where expense_id = ${rows[2].id} order by member_id
    `;
    expect(splits.map((s) => ({ ...s }))).toEqual([
      { member_id: "m1", amount_cents: 120000, weight: 3 },
      { member_id: "m2", amount_cents: 80000, weight: 2 },
    ]);

    const [schedule] =
      await t.sql`select *, next_occurrence_at::text as next_at from recurring_expenses`;
    expect(schedule.source_expense_id).toBe(rows[2].id);
    expect(schedule.occurrence_count).toBe(3);
    expect(schedule.next_at).toBe("2026-10-01 12:00:00");

    const activity = await t.sql`
      select type, actor_member_id from group_activities order by created_at
    `;
    expect(activity.map((a) => a.type)).toEqual([
      "recurring_expense_created",
      "recurring_expense_created",
    ]);
    expect(activity[0].actor_member_id).toBeNull();

    // Running again the same day adds nothing.
    expect(
      (await generateDueRecurringExpenses(t.db, noon("2026-09-02"))).created,
    ).toBe(0);
  });

  it("copies itemized receipts with their assignments", async () => {
    await seedRent(noon("2026-09-01"));
    await t.sql`update expenses set entry_mode = 'itemized', split_mode = 'exact'`;
    await t.sql`
      insert into expense_items (id, expense_id, description, amount_cents, quantity, sort_order)
      values ('i1', 'rent-1', 'Room A', 120000, 1, 0), ('i2', 'rent-1', 'Room B', 80000, 1, 1)
    `;
    await t.sql`
      insert into expense_item_assignments (expense_item_id, member_id)
      values ('i1', 'm1'), ('i2', 'm2')
    `;
    await setExpenseRecurrence(t.db, {
      groupId: "g1",
      expenseId: "rent-1",
      spentAt: noon("2026-09-01"),
      repeat: "weekly",
      actorMemberId: "m1",
    });

    await generateDueRecurringExpenses(t.db, noon("2026-09-08"));
    const copied = await t.sql`
      select i.description, a.member_id from expense_items i
      join expense_item_assignments a on a.expense_item_id = i.id
      where i.expense_id <> 'rent-1' order by i.sort_order
    `;
    expect(copied.map((r) => [r.description, r.member_id])).toEqual([
      ["Room A", "m1"],
      ["Room B", "m2"],
    ]);
  });

  it("overlapping runs create each occurrence once", async () => {
    await seedRent(noon("2026-08-01"));
    await setExpenseRecurrence(t.db, {
      groupId: "g1",
      expenseId: "rent-1",
      spentAt: noon("2026-08-01"),
      repeat: "monthly",
      actorMemberId: "m1",
    });
    const other = t.connect();
    const results = await Promise.all([
      generateDueRecurringExpenses(t.db, noon("2026-09-02")),
      generateDueRecurringExpenses(other.db, noon("2026-09-02")),
    ]);
    expect(results[0].created + results[1].created).toBe(1);
    expect(await rentRows()).toHaveLength(2);
  });

  it("keeps the schedule on an unchanged edit, restarts it on a new date, and stops it", async () => {
    await seedRent(noon("2026-07-01"));
    const base = {
      groupId: "g1",
      expenseId: "rent-1",
      actorMemberId: "m1",
    };
    await setExpenseRecurrence(t.db, {
      ...base,
      spentAt: noon("2026-07-01"),
      repeat: "monthly",
    });
    await generateDueRecurringExpenses(t.db, noon("2026-08-02"));
    const [{ source_expense_id: latest }] =
      await t.sql`select source_expense_id from recurring_expenses`;

    // Editing the latest occurrence without changing its date keeps the count.
    await setExpenseRecurrence(t.db, {
      ...base,
      expenseId: latest,
      spentAt: noon("2026-08-01"),
      repeat: "monthly",
    });
    let [schedule] =
      await t.sql`select *, next_occurrence_at::text as next_at from recurring_expenses`;
    expect(schedule.occurrence_count).toBe(2);

    await setExpenseRecurrence(t.db, {
      ...base,
      expenseId: latest,
      spentAt: noon("2026-08-05"),
      repeat: "weekly",
    });
    [schedule] =
      await t.sql`select *, next_occurrence_at::text as next_at from recurring_expenses`;
    expect(schedule.occurrence_count).toBe(1);
    expect(schedule.next_at).toBe("2026-08-12 12:00:00");

    await setExpenseRecurrence(t.db, {
      ...base,
      expenseId: latest,
      spentAt: noon("2026-08-05"),
      repeat: "never",
    });
    expect(
      await t.sql`select *, next_occurrence_at::text as next_at from recurring_expenses`,
    ).toHaveLength(0);
  });

  it("ends the schedule when its template expense is deleted", async () => {
    await seedRent(noon("2026-09-01"));
    await setExpenseRecurrence(t.db, {
      groupId: "g1",
      expenseId: "rent-1",
      spentAt: noon("2026-09-01"),
      repeat: "monthly",
      actorMemberId: "m1",
    });
    await t.sql`delete from expenses where id = 'rent-1'`;
    expect(
      await t.sql`select *, next_occurrence_at::text as next_at from recurring_expenses`,
    ).toHaveLength(0);
  });
});
