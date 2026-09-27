import { isNull, type SQL } from "drizzle-orm";
import { expenses } from "@/db/schema";

/** Expenses that still count. Soft-deleted rows stay in the table for restore. */
export function activeExpense(): SQL {
  return isNull(expenses.deletedAt);
}
