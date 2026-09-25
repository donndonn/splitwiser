import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Database-backed tests run only against a dedicated server named by
 * TEST_DATABASE_URL (never DATABASE_URL). Each suite gets its own fresh
 * database, created and dropped here. See README "Testing".
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

export type TestDatabase = {
  db: Db;
  sql: postgres.Sql;
  url: string;
  /** Apply migrations (all, or the first `count`). */
  migrate(count?: number): Promise<void>;
  /** Open another pool, for concurrent transactions. */
  connect(max?: number): { db: Db; sql: postgres.Sql };
  drop(): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `splitwiser_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const pools: postgres.Sql[] = [];

  const connect = (max = 10) => {
    const sql = postgres(url.toString(), {
      max,
      prepare: false,
      onnotice: () => {},
    });
    pools.push(sql);
    return { sql, db: drizzle(sql, { schema }) };
  };
  const main = connect();

  return {
    ...main,
    url: url.toString(),
    connect,
    async migrate(count?: number) {
      if (count == null) {
        await migrate(main.db, { migrationsFolder: MIGRATIONS_DIR });
        return;
      }
      const dir = await mkdtemp(path.join(tmpdir(), "splitwiser-migrations-"));
      try {
        await cp(MIGRATIONS_DIR, dir, { recursive: true });
        const journalPath = path.join(dir, "meta/_journal.json");
        const journal = JSON.parse(await readFile(journalPath, "utf8"));
        journal.entries = journal.entries.slice(0, count);
        await writeFile(journalPath, JSON.stringify(journal));
        await migrate(main.db, { migrationsFolder: dir });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async drop() {
      await Promise.all(pools.map((p) => p.end({ timeout: 5 })));
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end({ timeout: 5 });
    },
  };
}

/** Insert N onboarded users quickly. */
export async function seedUsers(sql: postgres.Sql, count: number, prefix = "seed") {
  if (count <= 0) return;
  await sql`
    insert into users (id, email, onboarding_completed_at)
    select ${prefix} || '-' || g, ${prefix} || '-' || g || '@example.test', now()
    from generate_series(1, ${count}) as g
  `;
}

export async function setMaxUsers(sql: postgres.Sql, maxUsers: number) {
  await sql`update app_settings set max_users = ${maxUsers} where id = 1`;
}

/** A group with one admin member (an onboarded user) and a live invite. */
export async function seedGroupWithInvite(
  sql: postgres.Sql,
  options: { uses?: number; maxUses?: number; expiresAt?: Date } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const adminUserId = `admin-${suffix}`;
  const groupId = `group-${suffix}`;
  const adminMemberId = `member-${suffix}`;
  const inviteId = `invite-${suffix}`;
  const token = `token-${suffix}`;
  await sql`
    insert into users (id, email, onboarding_completed_at)
    values (${adminUserId}, ${`${adminUserId}@example.test`}, now())
  `;
  await sql`insert into groups (id, name) values (${groupId}, 'Trip')`;
  await sql`
    insert into members (id, group_id, user_id, display_name, is_admin)
    values (${adminMemberId}, ${groupId}, ${adminUserId}, 'Admin', true)
  `;
  await sql`
    insert into invites (id, group_id, token, expires_at, max_uses, uses, created_by_member_id)
    values (
      ${inviteId}, ${groupId}, ${token},
      ${(options.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000)).toISOString()}::timestamp,
      ${options.maxUses ?? 15}, ${options.uses ?? 0}, ${adminMemberId}
    )
  `;
  return { adminUserId, groupId, adminMemberId, inviteId, token };
}
