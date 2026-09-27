// Vercel runs `vercel-build` instead of `build` when this script exists.
// Production deploys apply pending Drizzle migrations first, then `next build`.
// A failed migration fails the build, so the previous deployment stays live.
//
// Preview and development builds never migrate. Preview deploys can point at
// the production database, so the VERCEL_ENV gate is the whole safety check.
// This script does not load .env.local; Vercel injects Neon env vars into the
// build environment. Local `npm run build` does not run this file.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  destructiveFindings,
  formatDestructiveError,
  pendingJournalEntries,
} from "./migration-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(root, "drizzle");

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            signal
              ? `next build killed (${signal})`
              : `next build exited with code ${code}`,
          ),
        );
      }
    });
  });
}

async function lastAppliedMillis(sql) {
  const [row] = await sql`
    select to_regclass('drizzle.__drizzle_migrations') as rel
  `;
  if (!row?.rel) return null;
  const [latest] = await sql`
    select created_at
    from drizzle.__drizzle_migrations
    order by created_at desc
    limit 1
  `;
  if (!latest) return null;
  return Number(latest.created_at);
}

async function applyProductionMigrations() {
  // Direct connection only. The pooled DATABASE_URL goes through PgBouncer,
  // and the migrator runs pending files in one transaction.
  const url = process.env.DATABASE_URL_UNPOOLED?.trim();
  if (!url) {
    throw new Error(
      "[migrate] DATABASE_URL_UNPOOLED is not set. Production builds migrate only with the direct Neon URL. Add it to the Production environment and expose it at build time. The pooled DATABASE_URL is not used.",
    );
  }

  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  if (!Array.isArray(journal.entries)) {
    throw new Error("[migrate] drizzle/meta/_journal.json has no entries array");
  }

  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  try {
    const pending = pendingJournalEntries(
      journal.entries,
      await lastAppliedMillis(sql),
    );
    if (pending.length === 0) {
      console.log("[migrate] no pending migrations");
      return;
    }
    console.log(`[migrate] pending: ${pending.map((entry) => entry.tag).join(", ")}`);
    for (const entry of pending) {
      const file = path.join(migrationsFolder, `${entry.tag}.sql`);
      let body;
      try {
        body = await readFile(file, "utf8");
      } catch {
        throw new Error(`[migrate] missing migration file ${entry.tag}.sql`);
      }
      const findings = destructiveFindings(body);
      if (findings.length > 0) {
        throw new Error(formatDestructiveError(entry.tag, findings));
      }
    }
    await migrate(drizzle(sql), { migrationsFolder });
    console.log(`[migrate] applied ${pending.length} migration(s)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv !== "production") {
  console.log(`[migrate] skipped: VERCEL_ENV=${vercelEnv ?? "unset"}`);
} else {
  console.log("[migrate] VERCEL_ENV=production, applying migrations...");
  try {
    await applyProductionMigrations();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.startsWith("[migrate]") ? message : `[migrate] ${message}`);
    process.exit(1);
  }
}

try {
  await runNextBuild();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
