import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

describe.skipIf(!hasTestDatabase)("0011_invite_only_signup migration", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    const journal = JSON.parse(
      await readFile(
        path.resolve(__dirname, "../../drizzle/meta/_journal.json"),
        "utf8",
      ),
    );
    const index = journal.entries.findIndex(
      (e: { tag: string }) => e.tag === "0011_invite_only_signup",
    );
    await t.migrate(index);

    await t.sql`
      insert into users (id, email) values
        ('with-group', 'a@example.test'),
        ('no-group', 'b@example.test')
    `;
    await t.sql`insert into groups (id, name) values ('g1', 'Trip'), ('g2', 'Home')`;
    await t.sql`
      insert into members (id, group_id, user_id, display_name, is_admin) values
        ('m1', 'g1', 'with-group', 'A', true),
        ('m2', 'g1', null, 'Placeholder', false)
    `;
    await t.sql`
      insert into invites (id, group_id, token, uses, created_by_member_id) values
        ('i1', 'g1', 'old-1', 3, 'm1'),
        ('i2', 'g1', 'old-2', 0, 'm1')
    `;

    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("grandfathers every existing account, with or without groups", async () => {
    const rows = await t.sql`
      select id, onboarding_completed_at, signup_invite_id from users order by id
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.onboarding_completed_at).not.toBeNull();
      expect(row.signup_invite_id).toBeNull();
    }
  });

  it("revokes previous links and keeps their history", async () => {
    const rows = await t.sql`select id, uses, revoked_at from invites order by id`;
    expect(rows.map((r) => r.id)).toEqual(["i1", "i2"]);
    expect(rows.every((r) => r.revoked_at != null)).toBe(true);
    expect(rows[0].uses).toBe(3);
  });

  it("keeps memberships and placeholders intact", async () => {
    const rows = await t.sql`select id, user_id from members order by id`;
    expect(rows).toEqual([
      { id: "m1", user_id: "with-group" },
      { id: "m2", user_id: null },
    ]);
  });

  it("seeds a 500-account cap", async () => {
    const rows = await t.sql`select id, max_users from app_settings`;
    expect(rows).toEqual([{ id: 1, max_users: 500 }]);
    await expect(
      t.sql`update app_settings set max_users = -1`,
    ).rejects.toThrow(/app_settings_max_users_nonnegative/);
    await expect(
      t.sql`insert into app_settings (id, max_users) values (2, 1)`,
    ).rejects.toThrow(/app_settings_singleton/);
  });
});

describe.skipIf(!hasTestDatabase)("0012_site_admin migration", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    const journal = JSON.parse(
      await readFile(
        path.resolve(__dirname, "../../drizzle/meta/_journal.json"),
        "utf8",
      ),
    );
    const index = journal.entries.findIndex(
      (e: { tag: string }) => e.tag === "0012_site_admin",
    );
    await t.migrate(index);

    await t.sql`
      insert into users (id, email, onboarding_completed_at) values
        ('active', 'a@example.test', now()),
        ('pending', 'p@example.test', null)
    `;

    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  it("leaves existing accounts' signup date unknown", async () => {
    const [row] = await t.sql`select created_at from users where id = 'active'`;
    expect(row.created_at).toBeNull();
  });

  it("starts unfinished signups' cleanup window at rollout", async () => {
    const [row] = await t.sql`select created_at from users where id = 'pending'`;
    expect(row.created_at).not.toBeNull();
  });

  it("dates new accounts", async () => {
    await t.sql`insert into users (id, email) values ('new', 'n@example.test')`;
    const [row] = await t.sql`select created_at from users where id = 'new'`;
    expect(row.created_at).not.toBeNull();
  });
});
