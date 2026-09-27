import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

describe.skipIf(!hasTestDatabase)("expense_comments table", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    await t.sql`insert into groups (id, name) values ('g1', 'Trip')`;
    await t.sql`
      insert into members (id, group_id, display_name) values
        ('m1', 'g1', 'A'),
        ('m2', 'g1', 'B')
    `;
    await t.sql`
      insert into expenses (id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id)
      values ('e1', 'g1', 'Dinner', 1000, 'm1', 'm1'),
             ('e2', 'g1', 'Taxi', 500, 'm1', 'm1')
    `;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("rejects empty and overlong bodies", async () => {
    await expect(
      t.sql`insert into expense_comments (id, expense_id, author_member_id, body) values ('c0', 'e1', 'm1', '')`,
    ).rejects.toThrow(/expense_comments_body_length/);
    await expect(
      t.sql`insert into expense_comments (id, expense_id, author_member_id, body) values ('c0', 'e1', 'm1', ${"a".repeat(1001)})`,
    ).rejects.toThrow(/expense_comments_body_length/);
  });

  it("keeps a comment when its author leaves the group", async () => {
    await t.sql`insert into expense_comments (id, expense_id, author_member_id, body) values ('c1', 'e1', 'm2', 'Thanks!')`;
    await t.sql`delete from members where id = 'm2'`;
    const [row] = await t.sql`select author_member_id, body from expense_comments where id = 'c1'`;
    expect(row).toEqual({ author_member_id: null, body: "Thanks!" });
  });

  it("removes comments with their expense", async () => {
    await t.sql`insert into expense_comments (id, expense_id, author_member_id, body) values ('c2', 'e2', 'm1', 'Cash')`;
    await t.sql`delete from expenses where id = 'e2'`;
    const rows = await t.sql`select id from expense_comments where expense_id = 'e2'`;
    expect(rows).toHaveLength(0);
  });
});
