import { and, desc, eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  expenseComments,
  expenseSplits,
  expenses,
  groupActivities,
  groups,
  members,
  users,
  type GroupActivityPayload,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { activeExpense } from "@/lib/expenses";
import {
  describeActivity,
  type ActivityImpact,
  type ActivityKind,
  type ActivityTextPart,
} from "@/lib/activity";

export type ActivityFeedItem = {
  id: string;
  kind: ActivityKind;
  groupId: string;
  createdAt: Date;
  actorName: string;
  actorImage: string | null;
  parts: ActivityTextPart[];
  impact: ActivityImpact | null;
  /** Comment text, for comment rows. */
  quote: string | null;
  href: string | null;
  /** Set when this deleted-expense row can still be restored. */
  restoreExpenseId: string | null;
};

type RawRow = {
  id: string;
  kind: ActivityKind;
  groupId: string;
  expenseId: string | null;
  actorMemberId: string | null;
  actorName: string | null;
  actorImage: string | null;
  payload: GroupActivityPayload;
  quote: string | null;
  createdAt: Date;
  count: number;
};

const EXPENSE_KINDS = new Set<ActivityKind>([
  "expense_created",
  "expense_updated",
  "expense_restored",
  "comment_added",
]);

/** Repeated edits of one expense by one person, folded into one row. */
function foldRepeatedUpdates(rows: RawRow[]): RawRow[] {
  const folded: RawRow[] = [];
  for (const row of rows) {
    const prev = folded.at(-1);
    if (
      prev &&
      row.kind === "expense_updated" &&
      prev.kind === "expense_updated" &&
      row.expenseId === prev.expenseId &&
      row.actorMemberId === prev.actorMemberId
    ) {
      prev.count += 1;
      continue;
    }
    folded.push({ ...row });
  }
  return folded;
}

function activityHref(
  row: RawRow,
  expenseExists: boolean,
  allGroups: boolean,
): string | null {
  const base = `/g/${row.groupId}`;
  if (EXPENSE_KINDS.has(row.kind) && expenseExists) {
    return `${base}/expenses/${row.expenseId}`;
  }
  if (row.kind === "settlement_recorded") return `${base}/balances`;
  if (row.kind === "member_joined") return `${base}/members`;
  return allGroups ? base : null;
}

/**
 * Activity the viewer can see, newest first: every group they belong to, or
 * one group when `groupId` is set. Merges the activity log with expense
 * comments and describes each row from the viewer's point of view.
 */
export async function loadActivityFeed(options: {
  viewerUserId: string;
  groupId?: string;
  limit?: number;
  client?: Db;
}): Promise<ActivityFeedItem[]> {
  const client = options.client ?? defaultDb;
  const limit = options.limit ?? 50;

  const memberships = await client
    .select({
      memberId: members.id,
      displayName: members.displayName,
      groupId: groups.id,
      groupName: groups.name,
      currency: groups.currency,
    })
    .from(members)
    .innerJoin(groups, eq(members.groupId, groups.id))
    .where(
      options.groupId
        ? and(
            eq(members.userId, options.viewerUserId),
            eq(members.groupId, options.groupId),
          )
        : eq(members.userId, options.viewerUserId),
    );
  if (memberships.length === 0) return [];

  const groupById = new Map(memberships.map((m) => [m.groupId, m]));
  const groupIds = [...groupById.keys()];
  const viewerMemberIds = new Set(memberships.map((m) => m.memberId));

  const [activityRows, commentRows] = await Promise.all([
    client
      .select({
        id: groupActivities.id,
        type: groupActivities.type,
        groupId: groupActivities.groupId,
        expenseId: groupActivities.expenseId,
        actorMemberId: groupActivities.actorMemberId,
        payload: groupActivities.payload,
        createdAt: groupActivities.createdAt,
        actorName: members.displayName,
        actorImage: users.image,
      })
      .from(groupActivities)
      .leftJoin(members, eq(groupActivities.actorMemberId, members.id))
      .leftJoin(users, eq(members.userId, users.id))
      .where(inArray(groupActivities.groupId, groupIds))
      .orderBy(desc(groupActivities.createdAt))
      // Extra rows so folding repeated edits still fills the page.
      .limit(limit * 2),
    client
      .select({
        id: expenseComments.id,
        groupId: expenses.groupId,
        expenseId: expenseComments.expenseId,
        description: expenses.description,
        actorMemberId: expenseComments.authorMemberId,
        body: expenseComments.body,
        createdAt: expenseComments.createdAt,
        actorName: members.displayName,
        actorImage: users.image,
      })
      .from(expenseComments)
      .innerJoin(expenses, eq(expenseComments.expenseId, expenses.id))
      .leftJoin(members, eq(expenseComments.authorMemberId, members.id))
      .leftJoin(users, eq(members.userId, users.id))
      .where(and(inArray(expenses.groupId, groupIds), activeExpense()))
      .orderBy(desc(expenseComments.createdAt))
      .limit(limit),
  ]);

  const merged: RawRow[] = [
    ...activityRows.map((a) => ({
      id: a.id,
      kind: a.type as ActivityKind,
      groupId: a.groupId,
      expenseId: a.expenseId,
      actorMemberId: a.actorMemberId,
      actorName: a.actorName,
      actorImage: a.actorImage,
      payload: a.payload,
      quote: null,
      createdAt: a.createdAt,
      count: 1,
    })),
    ...commentRows.map((c) => ({
      id: `comment:${c.id}`,
      kind: "comment_added" as const,
      groupId: c.groupId,
      expenseId: c.expenseId,
      actorMemberId: c.actorMemberId,
      actorName: c.actorName,
      actorImage: c.actorImage,
      payload: {
        actorName: c.actorName ?? "Someone",
        description: c.description,
      },
      quote: c.body,
      createdAt: c.createdAt,
      count: 1,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const rows = foldRepeatedUpdates(merged).slice(0, limit);

  const expenseIds = [
    ...new Set(
      rows
        .filter(
          (r) =>
            r.expenseId &&
            (EXPENSE_KINDS.has(r.kind) || r.kind === "expense_deleted"),
        )
        .map((r) => r.expenseId as string),
    ),
  ];
  const [expenseRows, viewerSplits] =
    expenseIds.length === 0
      ? [[], []]
      : await Promise.all([
          client
            .select({
              id: expenses.id,
              amountCents: expenses.amountCents,
              paidByMemberId: expenses.paidByMemberId,
              deletedAt: expenses.deletedAt,
            })
            .from(expenses)
            .where(inArray(expenses.id, expenseIds)),
          client
            .select({
              expenseId: expenseSplits.expenseId,
              amountCents: expenseSplits.amountCents,
            })
            .from(expenseSplits)
            .where(
              and(
                inArray(expenseSplits.expenseId, expenseIds),
                inArray(expenseSplits.memberId, [...viewerMemberIds]),
              ),
            ),
        ]);
  const expenseById = new Map(expenseRows.map((e) => [e.id, e]));
  const viewerShareByExpense = new Map(
    viewerSplits.map((s) => [s.expenseId, s.amountCents]),
  );

  return rows.map((row) => {
    const group = groupById.get(row.groupId)!;
    const stored = row.expenseId ? expenseById.get(row.expenseId) : undefined;
    const expense = stored?.deletedAt ? undefined : stored;
    const payload: GroupActivityPayload = {
      ...row.payload,
      actorName: row.actorName ?? row.payload.actorName,
    };
    const { parts, impact } = describeActivity({
      kind: row.kind,
      payload,
      currency: group.currency,
      actorIsViewer: row.actorMemberId === group.memberId,
      viewerMemberId: group.memberId,
      viewerName: group.displayName,
      groupName: options.groupId ? null : group.groupName,
      count: row.count,
      expense:
        EXPENSE_KINDS.has(row.kind) && row.kind !== "comment_added"
          ? expense
            ? {
                amountCents: expense.amountCents,
                paidByViewer: expense.paidByMemberId === group.memberId,
                viewerShareCents: viewerShareByExpense.get(expense.id) ?? 0,
              }
            : null
          : undefined,
    });

    return {
      id: row.id,
      kind: row.kind,
      groupId: row.groupId,
      createdAt: row.createdAt,
      actorName: payload.actorName || "Someone",
      actorImage: row.actorImage,
      parts,
      impact,
      quote: row.quote,
      href: activityHref(row, Boolean(expense), !options.groupId),
      restoreExpenseId:
        row.kind === "expense_deleted" && stored?.deletedAt
          ? row.expenseId
          : null,
    };
  });
}
