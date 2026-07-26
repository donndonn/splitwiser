import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Database calls will fail.");
}

const client = postgres(connectionString ?? "postgresql://localhost:5432/splitwiser", {
  prepare: false,
  max: 10,
});

export const db = drizzle(client, { schema });
