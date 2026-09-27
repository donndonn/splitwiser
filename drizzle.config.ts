import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Missing files are ignored. Local runs read .env.local / .env; on Vercel
// the Neon integration injects DATABASE_URL* into the environment.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "",
  },
});
