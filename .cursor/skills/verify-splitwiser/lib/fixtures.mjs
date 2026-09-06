import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..");
const ROOT = join(SKILL_DIR, "../../..");

config({ path: join(ROOT, ".env.local") });
config({ path: join(ROOT, ".env") });

const VERIFY_DOMAIN = "splitwiser.invalid";

function requireRunId(runId) {
  if (!/^[a-f0-9]{8}$/.test(runId ?? "")) {
    throw new Error(`Invalid RUN_ID: ${runId}`);
  }
  return runId;
}

function emailFor(runId, role) {
  return `swv-${runId}-${role}@${VERIFY_DOMAIN}`;
}

function usernameFor(runId, role) {
  return `swv${runId}${role[0]}`;
}

function groupNamePrefix(runId) {
  return `swv-${runId}`;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }
  return postgres(url, { prepare: false, max: 1 });
}

async function seed(runId) {
  requireRunId(runId);
  const sql = connect();
  const roles = [
    { role: "alice", name: "Alice Verify" },
    { role: "bob", name: "Bob Verify" },
  ];

  try {
    const users = [];
    for (const { role, name } of roles) {
      const email = emailFor(runId, role);
      const username = usernameFor(runId, role);
      const existing = await sql`
        select id, name, username, email
        from users
        where email = ${email}
        limit 1
      `;
      if (existing[0]) {
        users.push({ ...existing[0], role });
        continue;
      }
      const id = randomUUID();
      await sql`
        insert into users (id, name, username, email)
        values (${id}, ${name}, ${username}, ${email})
      `;
      users.push({ id, name, username, email, role });
    }

    const fixtures = {
      runId,
      groupNamePrefix: groupNamePrefix(runId),
      users,
    };
    const runDir = join(SKILL_DIR, ".run", runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "fixtures.json"),
      `${JSON.stringify(fixtures, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(fixtures, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function deleteVerifyGroups(sql, runId) {
  const prefix = `${groupNamePrefix(runId)}%`;
  const groups = await sql`select id from groups where name like ${prefix}`;
  for (const group of groups) {
    const expenseIds = await sql`
      select id from expenses where group_id = ${group.id}
    `;
    if (expenseIds.length > 0) {
      const ids = expenseIds.map((row) => row.id);
      const itemIds = await sql`
        select id from expense_items where expense_id in ${sql(ids)}
      `;
      if (itemIds.length > 0) {
        const items = itemIds.map((row) => row.id);
        await sql`
          delete from expense_item_assignments
          where expense_item_id in ${sql(items)}
        `;
        await sql`delete from expense_items where id in ${sql(items)}`;
      }
      await sql`delete from expense_splits where expense_id in ${sql(ids)}`;
      await sql`delete from expenses where id in ${sql(ids)}`;
    }
    await sql`delete from settlements where group_id = ${group.id}`;
    await sql`delete from group_activities where group_id = ${group.id}`;
    await sql`delete from invites where group_id = ${group.id}`;
    await sql`delete from members where group_id = ${group.id}`;
    await sql`delete from groups where id = ${group.id}`;
  }
  return groups.length;
}

async function cleanup(runId) {
  requireRunId(runId);
  const sql = connect();
  try {
    const groupsDeleted = await deleteVerifyGroups(sql, runId);
    const like = `swv-${runId}-%@${VERIFY_DOMAIN}`;
    const users = await sql`
      select id from users where email like ${like}
    `;
    if (users.length > 0) {
      const ids = users.map((row) => row.id);
      await sql`
        delete from friend_requests
        where from_user_id in ${sql(ids)} or to_user_id in ${sql(ids)}
      `;
      await sql`
        delete from friendships
        where user_id_a in ${sql(ids)} or user_id_b in ${sql(ids)}
      `;
      await sql`delete from ai_parse_requests where user_id in ${sql(ids)}`;
      await sql`delete from users where id in ${sql(ids)}`;
    }
    process.stdout.write(
      `${JSON.stringify({ runId, groupsDeleted, usersDeleted: users.length })}\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const [command, runId] = process.argv.slice(2);
if (command === "seed") {
  await seed(runId);
} else if (command === "cleanup") {
  await cleanup(runId);
} else {
  console.error("Usage: fixtures.mjs <seed|cleanup> <RUN_ID>");
  process.exit(1);
}
