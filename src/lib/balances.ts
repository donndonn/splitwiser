import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseSplits, expenses, settlements } from "@/db/schema";

export type MemberBalance = {
  memberId: string;
  netCents: number;
};

/**
 * Net balance for each member in a group:
 *   +amount paid as payer
 *   -amount owed via expense splits
 *   +amount paid out via settlements (reduces what they owe)
 *   -amount received via settlements (reduces what they're owed)
 *
 * Positive = others owe them. Negative = they owe others.
 */
export async function getGroupBalances(
  groupId: string,
): Promise<MemberBalance[]> {
  const paid = await db
    .select({
      memberId: expenses.paidByMemberId,
      total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::bigint`,
    })
    .from(expenses)
    .where(eq(expenses.groupId, groupId))
    .groupBy(expenses.paidByMemberId);

  const owed = await db
    .select({
      memberId: expenseSplits.memberId,
      total: sql<number>`coalesce(sum(${expenseSplits.amountCents}), 0)::bigint`,
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
    .where(eq(expenses.groupId, groupId))
    .groupBy(expenseSplits.memberId);

  const settledOut = await db
    .select({
      memberId: settlements.fromMemberId,
      total: sql<number>`coalesce(sum(${settlements.amountCents}), 0)::bigint`,
    })
    .from(settlements)
    .where(eq(settlements.groupId, groupId))
    .groupBy(settlements.fromMemberId);

  const settledIn = await db
    .select({
      memberId: settlements.toMemberId,
      total: sql<number>`coalesce(sum(${settlements.amountCents}), 0)::bigint`,
    })
    .from(settlements)
    .where(eq(settlements.groupId, groupId))
    .groupBy(settlements.toMemberId);

  const nets = new Map<string, number>();
  const bump = (id: string, delta: number) => {
    nets.set(id, (nets.get(id) ?? 0) + delta);
  };

  for (const row of paid) bump(row.memberId, Number(row.total));
  for (const row of owed) bump(row.memberId, -Number(row.total));
  for (const row of settledOut) bump(row.memberId, Number(row.total));
  for (const row of settledIn) bump(row.memberId, -Number(row.total));

  return [...nets.entries()].map(([memberId, netCents]) => ({
    memberId,
    netCents,
  }));
}

export async function getMemberNet(
  groupId: string,
  memberId: string,
): Promise<number> {
  const balances = await getGroupBalances(groupId);
  return balances.find((b) => b.memberId === memberId)?.netCents ?? 0;
}
