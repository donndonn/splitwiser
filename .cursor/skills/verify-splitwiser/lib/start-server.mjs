import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../..");

const url = process.argv[2];
const secret = process.argv[3];
const port = process.argv[4];
const host = process.argv[5];
const logPath = process.argv[6];
const pidPath = process.argv[7];

if (!url || !secret || !port || !host || !logPath || !pidPath) {
  console.error(
    "Usage: start-server.mjs URL SECRET PORT HOST LOG_PATH PID_PATH",
  );
  process.exit(1);
}

const log = openSync(logPath, "a");
const child = spawn(
  "npm",
  ["run", "dev", "--", "--port", port, "--hostname", host],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      AUTH_URL: url,
      SPLITWISER_VERIFY_SECRET: secret,
      SPLITWISER_VERIFY_DISTDIR: ".next-verify",
      PORT: port,
    },
    detached: true,
    stdio: ["ignore", log, log],
  },
);

if (!child.pid) {
  console.error("Failed to spawn npm run dev");
  process.exit(1);
}

writeFileSync(pidPath, `${child.pid}\n`);
child.unref();
process.stdout.write(`${child.pid}\n`);
