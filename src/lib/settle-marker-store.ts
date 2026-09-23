import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  expenseSplits,
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
  shouldPromptMarkAsSettled,
} from "@/lib/settle-marker";

/**
 * A query started before auth can reject after redirect or notFound, when
 * nothing is left to await it. This handler marks that rejection as handled.
 * Awaiting the original promise still throws.
 */
export function catchIfAbandoned<T>(promise: Promise<T>): Promise<T> {
  void promise.catch(() => undefined);
  return promise;
}

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
  paidByMemberId: string;
  paidByName: string;
  /** This member's split, or null when they are not on the expense. */
  viewerShareCents: number | null;
};

const expenseListColumns = {
  id: expenses.id,
  description: expenses.description,
  amountCents: expenses.amountCents,
  spentAt: expenses.spentAt,
  createdAt: expenses.createdAt,
  paidByMemberId: expenses.paidByMemberId,
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
  const rows = await db.execute<{ value: Date | string | null }>(sql`
    select greatest(
      (select max(${expenses.createdAt}) from ${expenses} where ${eq(expenses.groupId, groupId)}),
      (select max(${settlements.createdAt}) from ${settlements} where ${eq(settlements.groupId, groupId)})
    ) as value
  `);
  return asDate(rows[0]?.value);
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
  memberId: string;
  settledAt: Date | null;
  open: boolean;
  limit: number;
}): Promise<SettleExpenseRow[]> {
  const { groupId, memberId, settledAt, open, limit } = input;
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

  const rows = await db
    .select({
      ...expenseListColumns,
      viewerShareCents: expenseSplits.amountCents,
    })
    .from(expenses)
    .innerJoin(members, eq(expenses.paidByMemberId, members.id))
    .leftJoin(
      expenseSplits,
      and(
        eq(expenseSplits.expenseId, expenses.id),
        eq(expenseSplits.memberId, memberId),
      ),
    )
    .where(where)
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    viewerShareCents:
      row.viewerShareCents == null ? null : Number(row.viewerShareCents),
  }));
}

function loadDismissal(groupId: string, memberId: string) {
  return db
    .select()
    .from(groupSettlePromptDismissals)
    .where(
      and(
        eq(groupSettlePromptDismissals.groupId, groupId),
        eq(groupSettlePromptDismissals.memberId, memberId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

/**
 * Start the group reads that do not need the viewer. Call this before
 * awaiting membership so those queries overlap the auth check.
 * Rejections are handled if finish() never runs.
 */
export function beginGroupSettleView(groupId: string) {
  const balancesPromise = catchIfAbandoned(getGroupBalances(groupId));
  const latestMarkerPromise = catchIfAbandoned(getLatestSettleMarker(groupId));
  const activityWatermarkPromise = catchIfAbandoned(
    getGroupActivityWatermark(groupId),
  );

  return {
    finish(memberId: string) {
      return finishGroupSettleView(groupId, memberId, {
        balancesPromise,
        latestMarkerPromise,
        activityWatermarkPromise,
        dismissalPromise: loadDismissal(groupId, memberId),
      });
    },
  };
}

export function getGroupSettleView(groupId: string, memberId: string) {
  return beginGroupSettleView(groupId).finish(memberId);
}

async function finishGroupSettleView(
  groupId: string,
  memberId: string,
  started: {
    balancesPromise: ReturnType<typeof getGroupBalances>;
    latestMarkerPromise: ReturnType<typeof getLatestSettleMarker>;
    activityWatermarkPromise: ReturnType<typeof getGroupActivityWatermark>;
    dismissalPromise: ReturnType<typeof loadDismissal>;
  },
) {
  const [balances, latestMarker, activityWatermark, dismissal] =
    await Promise.all([
      started.balancesPromise,
      started.latestMarkerPromise,
      started.activityWatermarkPromise,
      started.dismissalPromise,
    ]);

  const settledAt = latestMarker?.settledAt ?? null;
  const [openPeriodExpenseCount, recent, archived] = await Promise.all([
    countOpenPeriodExpenses(groupId, settledAt),
    listExpenses({
      groupId,
      memberId,
      settledAt,
      open: true,
      limit: 20,
    }),
    settledAt
      ? listExpenses({
          groupId,
          memberId,
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
