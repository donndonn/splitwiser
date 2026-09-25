import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

/** The app database, or an isolated test database with the same schema. */
export type Db = PostgresJsDatabase<typeof schema>;
