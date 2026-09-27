import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityText } from "@/lib/activity";
import { loadActivityFeed } from "@/lib/activity-feed";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

describe.skipIf(!hasTestDatabase)("loadActivityFeed", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    await t.sql`insert into users (id, name) values ('u1', 'Vince'), ('u2', 'Alex')`;
    await t.sql`insert into groups (id, name) values ('g1', 'Trip'), ('g2', 'Flat'), ('g3', 'Not mine')`;
    await t.sql`
      insert into members (id, group_id, user_id, display_name) values
        ('m1', 'g1', 'u1', 'Vince'), ('m2', 'g1', 'u2', 'Alex'),
        ('m3', 'g2', 'u1', 'Vince'),
        ('m4', 'g3', 'u2', 'Alex')
    `;
    await t.sql`
      insert into expenses (id, group_id, description, amount_cents, paid_by_member_id, created_by_member_id)
      values ('e1', 'g1', 'Dinner', 1000, 'm2', 'm2')
    `;
    await t.sql`
      insert into expense_splits (expense_id, member_id, amount_cents)
      values ('e1', 'm1', 500), ('e1', 'm2', 500)
    `;
    await t.sql`
      insert into group_activities (id, group_id, type, actor_member_id, expense_id, payload, created_at) values
        ('a1', 'g1', 'expense_created', 'm2', 'e1', ${JSON.stringify({ actorName: "Alex", description: "Dinner", amountCents: 1000 })}::jsonb, now() - interval '5 hours'),
        ('a2', 'g1', 'expense_updated', 'm2', 'e1', ${JSON.stringify({ actorName: "Alex", description: "Dinner" })}::jsonb, now() - interval '4 hours'),
        ('a3', 'g1', 'expense_updated', 'm2', 'e1', ${JSON.stringify({ actorName: "Alex", description: "Dinner" })}::jsonb, now() - interval '3 hours'),
        ('a4', 'g2', 'group_renamed', 'm3', null, ${JSON.stringify({ actorName: "Vince", oldName: "Home", newName: "Flat" })}::jsonb, now() - interval '2 hours'),
        ('a5', 'g3', 'group_renamed', 'm4', null, ${JSON.stringify({ actorName: "Alex", oldName: "X", newName: "Not mine" })}::jsonb, now() - interval '1 hour')
    `;
    await t.sql`
      insert into expense_comments (id, expense_id, author_member_id, body, created_at)
      values ('c1', 'e1', 'm2', 'Nice spot', now() - interval '30 minutes')
    `;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("merges every group the viewer is in, newest first, from their side", async () => {
    const items = await loadActivityFeed({ viewerUserId: "u1", client: t.db });
    expect(items.map((i) => activityText(i.parts))).toEqual([
      "Alex commented on “Dinner” in “Trip”",
      "You renamed “Home” to “Flat”",
      "Alex updated “Dinner” 2 times in “Trip”",
      "Alex added “Dinner” in “Trip”",
    ]);
    expect(items[0].quote).toBe("Nice spot");
    expect(items[0].href).toBe("/g/g1/expenses/e1");
    expect(items[3].impact).toEqual({
      text: "You owe $5.00",
      tone: "negative",
    });
  });

  it("limits to one group when asked", async () => {
    const items = await loadActivityFeed({
      viewerUserId: "u1",
      groupId: "g2",
      client: t.db,
    });
    expect(items.map((i) => i.id)).toEqual(["a4"]);
  });
});
