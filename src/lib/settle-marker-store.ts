import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  expenses,
  groupSettleMarkers,
  groupSettlePromptDismissals,
  members,
  settlements,
  type GroupSettleMarker,
} from "@/db/schema";
import { getGroupBalances } from "@/lib/balances";
import {
  areAllBalancesZero,
  isDismissalActive,
  laterDate,
  shouldPromptMarkAsSettled,
} from "@/lib/settle-marker";

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type SettleExpenseRow = {
  id: string;
  description: string;
  amountCents: number;
  spentAt: Date;
  createdAt: Date;
  paidByName: string;
};

const expenseListColumns = {
  id: expenses.id,
  description: expenses.description,
  amountCents: expenses.amountCents,
  spentAt: expenses.spentAt,
  createdAt: expenses.createdAt,
  paidByName: members.displayName,
};

export async function getLatestSettleMarker(
  groupId: string,
): Promise<GroupSettleMarker | null> {
  const [row] = await db
    .select()
    .from(groupSettleMarkers)
    .where(eq(groupSettleMarkers.groupId, groupId))
    .orderBy(
      desc(groupSettleMarkers.settledAt),
      desc(groupSettleMarkers.createdAt),
    )
    .limit(1);
  return row ?? null;
}

export async function getGroupActivityWatermark(
  groupId: string,
): Promise<Date | null> {
  const [[expenseMax], [settlementMax]] = await Promise.all([
    db
      .select({
        value: sql<Date | null>`max(${expenses.createdAt})`,
      })
      .from(expenses)
      .where(eq(expenses.groupId, groupId)),
    db
      .select({
        value: sql<Date | null>`max(${settlements.createdAt})`,
      })
      .from(settlements)
      .where(eq(settlements.groupId, groupId)),
  ]);

  return laterDate(asDate(expenseMax?.value), asDate(settlementMax?.value));
}

async function countOpenPeriodExpenses(
  groupId: string,
  settledAt: Date | null,
): Promise<number> {
  const where = settledAt
    ? and(eq(expenses.groupId, groupId), gt(expenses.createdAt, settledAt))
    : eq(expenses.groupId, groupId);

  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(where);

  return Number(row?.count ?? 0);
}

async function listExpenses(input: {
  groupId: string;
  settledAt: Date | null;
  open: boolean;
  limit: number;
}): Promise<SettleExpenseRow[]> {
  const { groupId, settledAt, open, limit } = input;
  const cutoffClause =
    settledAt == null
      ? open
        ? undefined
        : sql`false`
      : open
        ? gt(expenses.createdAt, settledAt)
        : lte(expenses.createdAt, settledAt);

  const where =
    cutoffClause == null
      ? eq(expenses.groupId, groupId)
      : and(eq(expenses.groupId, groupId), cutoffClause);

  return db
    .select(expenseListColumns)
    .from(expenses)
    .innerJoin(members, eq(expenses.paidByMemberId, members.id))
    .where(where)
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(limit);
}

export async function getGroupSettleView(groupId: string, memberId: string) {
  const [balances, latestMarker, dismissal, activityWatermark] =
    await Promise.all([
      getGroupBalances(groupId),
      getLatestSettleMarker(groupId),
      db
        .select()
        .from(groupSettlePromptDismissals)
        .where(
          and(
            eq(groupSettlePromptDismissals.groupId, groupId),
            eq(groupSettlePromptDismissals.memberId, memberId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getGroupActivityWatermark(groupId),
    ]);

  const settledAt = latestMarker?.settledAt ?? null;
  const [openPeriodExpenseCount, recent, archived] = await Promise.all([
    countOpenPeriodExpenses(groupId, settledAt),
    listExpenses({
      groupId,
      settledAt,
      open: true,
      limit: 20,
    }),
    settledAt
      ? listExpenses({
          groupId,
          settledAt,
          open: false,
          limit: 50,
        })
      : Promise.resolve([] as SettleExpenseRow[]),
  ]);

  const fullySettled = areAllBalancesZero(balances);
  const showPrompt = shouldPromptMarkAsSettled({
    fullySettled,
    openPeriodExpenseCount,
    dismissed: isDismissalActive(dismissal, activityWatermark),
  });

  return {
    balances,
    latestMarker,
    activityWatermark,
    recent,
    archived,
    showPrompt,
    fullySettled,
    openPeriodExpenseCount,
  };
}
