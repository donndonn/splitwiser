// Settings shared by the local-only scripts. Everything here points at the
// Docker Postgres from compose.yaml, never at Neon.

export const LOCAL_PORT = Number(process.env.LOCAL_PORT ?? 3100);
export const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;
export const LOCAL_DATABASE_URL =
  "postgres://splitwiser:splitwiser@localhost:54330/splitwiser";
export const LOCAL_VERIFY_SECRET = "local-dev";

/** Seeded account you sign in as. */
export const LOCAL_SIGN_IN_EMAIL = "you@splitwiser.invalid";

/** Environment for anything that should talk to the local database. */
export function localEnv(extra = {}) {
  return {
    ...process.env,
    // Real env wins over .env.local in both Next.js and dotenv, so these
    // override the Neon URLs without touching the developer's files.
    DATABASE_URL: LOCAL_DATABASE_URL,
    DATABASE_URL_UNPOOLED: LOCAL_DATABASE_URL,
    SPLITWISER_VERIFY_SECRET: LOCAL_VERIFY_SECRET,
    SPLITWISER_LOCAL_SIGN_IN_EMAIL: LOCAL_SIGN_IN_EMAIL,
    SPLITWISER_VERIFY_DISTDIR: ".next-local",
    AUTH_URL: LOCAL_URL,
    AUTH_SECRET: process.env.AUTH_SECRET ?? "local-dev-auth-secret",
    ...extra,
  };
}
