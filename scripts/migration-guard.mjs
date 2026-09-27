// Flags destructive SQL in Drizzle migration files before a production deploy
// applies them. A file opts in with a comment: `-- allow-destructive: <reason>`.

const ALLOW_DESTRUCTIVE = /--[ \t]*allow-destructive:[ \t]*\S/i;

/** True when the file explicitly opts in to destructive SQL. */
export function allowsDestructive(sql) {
  return ALLOW_DESTRUCTIVE.test(sql);
}

function stripSqlNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:''|[^'])*'/g, " ");
}

function statements(sql) {
  return stripSqlNoise(sql)
    .split(/-->\s*statement-breakpoint|;/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Destructive statement kinds in `sql`, or [] if the file opts in.
 * Comments and string literals are ignored. `DELETE FROM` counts only
 * when that statement has no WHERE.
 */
export function destructiveFindings(sql) {
  if (allowsDestructive(sql)) return [];
  const found = [];
  const add = (kind) => {
    if (!found.includes(kind)) found.push(kind);
  };
  for (const statement of statements(sql)) {
    if (/\bDROP\s+TABLE\b/i.test(statement)) add("DROP TABLE");
    if (/\bDROP\s+COLUMN\b/i.test(statement)) add("DROP COLUMN");
    if (/\bRENAME\b/i.test(statement)) add("RENAME");
    // TYPE must follow the column name, so a column named "type" with
    // SET DEFAULT is not a type change.
    if (
      /\bALTER\s+COLUMN\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(
        statement,
      ) ||
      /\bSET\s+DATA\s+TYPE\b/i.test(statement)
    ) {
      add("ALTER COLUMN TYPE");
    }
    if (/\bTRUNCATE\b/i.test(statement)) add("TRUNCATE");
    if (/\bDELETE\s+FROM\b/i.test(statement) && !/\bWHERE\b/i.test(statement)) {
      add("DELETE FROM without WHERE");
    }
  }
  return found;
}

export function formatDestructiveError(tag, findings) {
  return [
    `[migrate] refusing to apply ${tag}.sql (${findings.join(", ")})`,
    "[migrate] Add `-- allow-destructive: <reason>` to that file if this is intentional.",
  ].join("\n");
}

/**
 * Journal entries drizzle-orm would apply. The postgres migrator treats an
 * entry as pending when its `when` is greater than the latest
 * `drizzle.__drizzle_migrations.created_at`. `lastCreatedAt` null means the
 * migrations table is missing or empty, so every entry is pending.
 */
export function pendingJournalEntries(entries, lastCreatedAt) {
  if (lastCreatedAt == null) return entries;
  if (!Number.isFinite(lastCreatedAt)) {
    throw new Error(
      "[migrate] drizzle.__drizzle_migrations.created_at is not a finite number",
    );
  }
  return entries.filter((entry) => entry.when > lastCreatedAt);
}
