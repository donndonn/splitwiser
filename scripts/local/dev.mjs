// Run `next dev` against the local Postgres with the verify sign-in on.
// Uses its own port and dist dir, so a normal `npm run dev` can keep running.
import { spawn } from "node:child_process";
import { LOCAL_PORT, LOCAL_URL, localEnv } from "./env.mjs";

console.log(`Local app: ${LOCAL_URL}/signin (one-tap sign-in as Vince)`);
const child = spawn(
  "npx",
  ["next", "dev", "--port", String(LOCAL_PORT), ...process.argv.slice(2)],
  { stdio: "inherit", env: localEnv() },
);
child.on("exit", (code) => process.exit(code ?? 0));
