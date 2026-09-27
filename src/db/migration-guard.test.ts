import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowsDestructive,
  destructiveFindings,
  formatDestructiveError,
  pendingJournalEntries,
} from "../../scripts/migration-guard.mjs";

const entries = [
  { tag: "0000_a", when: 10 },
  { tag: "0001_b", when: 20 },
  { tag: "0002_c", when: 30 },
];

describe("pendingJournalEntries", () => {
  it("treats a missing migrations table as every entry pending", () => {
    expect(pendingJournalEntries(entries, null)).toEqual(entries);
  });

  it("keeps entries newer than the latest created_at", () => {
    expect(pendingJournalEntries(entries, 20).map((entry) => entry.tag)).toEqual([
      "0002_c",
    ]);
  });

  it("returns nothing when the latest created_at matches the last entry", () => {
    expect(pendingJournalEntries(entries, 30)).toEqual([]);
  });

  it("rejects a non-numeric created_at", () => {
    expect(() => pendingJournalEntries(entries, Number.NaN)).toThrow(
      /created_at/,
    );
  });
});

describe("destructiveFindings", () => {
  it.each([
    ["DROP TABLE", `DROP TABLE "friend_invites" CASCADE;`],
    ["DROP COLUMN", `ALTER TABLE "users" DROP COLUMN "legacy";`],
    ["RENAME", `ALTER TABLE "users" RENAME COLUMN "old" TO "new";`],
    ["ALTER COLUMN TYPE", `ALTER TABLE "users" ALTER COLUMN "name" TYPE text;`],
    [
      "ALTER COLUMN TYPE",
      `ALTER TABLE "users" ALTER COLUMN "count" SET DATA TYPE integer;`,
    ],
    ["TRUNCATE", `TRUNCATE TABLE "users";`],
    ["DELETE FROM without WHERE", `DELETE FROM "users";`],
  ])("flags %s", (kind, sql) => {
    expect(destructiveFindings(sql)).toContain(kind);
  });

  it.each([
    [`ALTER TABLE "users" ADD COLUMN "account_image" text;`],
    [`ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();`],
    [`ALTER TABLE "users" ALTER COLUMN "type" SET DEFAULT 'x';`],
    [`UPDATE "users" SET "created_at" = now() WHERE "onboarding_completed_at" IS NULL;`],
    [`DELETE FROM "users" WHERE "id" = 'x';`],
    [`ALTER TABLE "members" ADD CONSTRAINT "m" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;`],
    [`DROP INDEX "users_username_unique";`],
    [`-- we will DROP TABLE "old" later\nALTER TABLE "users" ADD COLUMN "x" text;`],
    [`SELECT 'DROP TABLE "users"' AS note;`],
  ])("allows safe SQL: %s", (sql) => {
    expect(destructiveFindings(sql)).toEqual([]);
  });

  it("flags a destructive statement after a breakpoint", () => {
    const sql = `
      ALTER TABLE "users" ADD COLUMN "x" text;--> statement-breakpoint
      DROP TABLE "old";
    `;
    expect(destructiveFindings(sql)).toEqual(["DROP TABLE"]);
  });

  it("reports each kind once", () => {
    const sql = `DROP TABLE "a"; DROP TABLE "b"; TRUNCATE "c";`;
    expect(destructiveFindings(sql)).toEqual(["DROP TABLE", "TRUNCATE"]);
  });

  it("opts in only when the marker includes a reason", () => {
    const drop = `DROP TABLE "old";`;
    expect(allowsDestructive(`-- allow-destructive: drop unused table\n${drop}`)).toBe(
      true,
    );
    expect(destructiveFindings(`-- allow-destructive: drop unused table\n${drop}`)).toEqual(
      [],
    );
    expect(destructiveFindings(`-- allow-destructive:\n${drop}`)).toEqual(["DROP TABLE"]);
    expect(destructiveFindings(`-- allow-destructive: \n${drop}`)).toEqual(["DROP TABLE"]);
  });

  it("matches destructive SQL case-insensitively", () => {
    expect(destructiveFindings(`drop table "old";`)).toEqual(["DROP TABLE"]);
  });

  it("formats a build-log error", () => {
    expect(formatDestructiveError("0016_drop_old", ["DROP TABLE"])).toContain(
      "0016_drop_old.sql",
    );
    expect(formatDestructiveError("0016_drop_old", ["DROP TABLE"])).toContain(
      "allow-destructive",
    );
  });

  it("flags the historical friend_invites drop and allows later additive files", async () => {
    const drizzle = path.resolve(__dirname, "../../drizzle");
    const dropped = await readFile(path.join(drizzle, "0005_friend_search.sql"), "utf8");
    const avatar = await readFile(path.join(drizzle, "0015_avatar_photo.sql"), "utf8");
    const defaults = await readFile(path.join(drizzle, "0012_site_admin.sql"), "utf8");
    expect(destructiveFindings(dropped)).toContain("DROP TABLE");
    expect(destructiveFindings(avatar)).toEqual([]);
    expect(destructiveFindings(defaults)).toEqual([]);
  });
});
