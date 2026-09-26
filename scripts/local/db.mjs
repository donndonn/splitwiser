// Start the local Postgres, apply migrations, and seed demo data.
//   node scripts/local/db.mjs         start + migrate + seed
//   node scripts/local/db.mjs reset   wipe the volume first
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { LOCAL_DATABASE_URL, LOCAL_SIGN_IN_EMAIL, localEnv } from "./env.mjs";

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "inherit", env: localEnv() });

if (process.argv[2] === "reset") {
  run("docker", ["compose", "down", "--volumes"]);
}
run("docker", ["compose", "up", "--detach", "--wait", "db"]);
run("npx", ["drizzle-kit", "migrate"]);

const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });

// Fixed ids keep the seed idempotent; rerunning it changes nothing.
const users = [
  { id: "local-user-you", name: "Vince", username: "vince", email: LOCAL_SIGN_IN_EMAIL },
  { id: "local-user-alex", name: "Alex", username: "alex", email: "alex@splitwiser.invalid" },
  { id: "local-user-sam", name: "Sam", username: "sam", email: "sam@splitwiser.invalid" },
  { id: "local-user-kim", name: "Kim", username: "kim", email: "kim@splitwiser.invalid" },
];

// "Tahoe trip": you, Alex, and a placeholder Bob. Sam and Kim are friends
// you can still add. "Just me" has only you, for the solo-group prompt.
const groups = [
  { id: "local-group-trip", name: "Tahoe trip" },
  { id: "local-group-solo", name: "Just me" },
];
const members = [
  { id: "local-member-trip-you", groupId: "local-group-trip", userId: "local-user-you", displayName: "Vince", isAdmin: true },
  { id: "local-member-trip-alex", groupId: "local-group-trip", userId: "local-user-alex", displayName: "Alex", isAdmin: false },
  { id: "local-member-trip-bob", groupId: "local-group-trip", userId: null, displayName: "Bob", isAdmin: false },
  { id: "local-member-solo-you", groupId: "local-group-solo", userId: "local-user-you", displayName: "Vince", isAdmin: true },
];
const friends = ["local-user-alex", "local-user-sam", "local-user-kim"];

try {
  for (const user of users) {
    await sql`
      insert into users (id, name, username, email, onboarding_completed_at)
      values (${user.id}, ${user.name}, ${user.username}, ${user.email}, now())
      on conflict (id) do nothing
    `;
  }
  for (const group of groups) {
    await sql`
      insert into groups (id, name) values (${group.id}, ${group.name})
      on conflict (id) do nothing
    `;
  }
  for (const m of members) {
    await sql`
      insert into members (id, group_id, user_id, display_name, is_admin)
      values (${m.id}, ${m.groupId}, ${m.userId}, ${m.displayName}, ${m.isAdmin})
      on conflict (id) do nothing
    `;
  }
  for (const friendId of friends) {
    // Same ordering as orderedPair in src/lib/friends.ts.
    const [a, b] = ["local-user-you", friendId].sort();
    await sql`
      insert into friendships (id, user_id_a, user_id_b)
      values (${`local-friend-${friendId}`}, ${a}, ${b})
      on conflict do nothing
    `;
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`\nLocal database ready. Run: npm run local:dev`);
