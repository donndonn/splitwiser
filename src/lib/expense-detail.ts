import { and, eq } from "drizzle-orm";
import {
  expenseItemAssignments,
  expenseItems,
  expenseSplits,
  expenses,
  members,
  users,
  type Expense,
} from "@/db/schema";
import type { Db } from "@/db/types";
import {
  buildItemizedReceiptBreakdown,
  buildSimpleReceiptBreakdown,
  type ExpenseReceiptBreakdown,
} from "@/lib/expense-receipt-breakdown";
import { activeExpense } from "@/lib/expenses";

/**
 * One live expense with its roster, splits, items, and receipt breakdown.
 * Shared by the member expense page and the read-only share page.
 * Null when the expense is missing, deleted, or in another group.
 */
export async function loadExpenseDetail(
  client: Db,
  input: { groupId: string; expenseId: string },
) {
  const { groupId, expenseId } = input;
  const [expense] = await client
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.groupId, groupId),
        activeExpense(),
      ),
    )
    .limit(1);
  if (!expense) return null;

  const [roster, splits, itemRows, assignmentRows] = await Promise.all([
    client
      .select({
        id: members.id,
        displayName: members.displayName,
        image: users.image,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.groupId, groupId))
      .orderBy(members.createdAt),
    client
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId)),
    client
      .select()
      .from(expenseItems)
      .where(eq(expenseItems.expenseId, expenseId))
      .orderBy(expenseItems.sortOrder),
    client
      .select({
        expenseItemId: expenseItemAssignments.expenseItemId,
        memberId: expenseItemAssignments.memberId,
        weight: expenseItemAssignments.weight,
      })
      .from(expenseItemAssignments)
      .innerJoin(
        expenseItems,
        eq(expenseItemAssignments.expenseItemId, expenseItems.id),
      )
      .where(eq(expenseItems.expenseId, expenseId)),
  ]);

  const assignedMembers = new Map<string, string[]>();
  const assignedWeights = new Map<string, Record<string, number>>();
  for (const assignment of assignmentRows) {
    assignedMembers.set(assignment.expenseItemId, [
      ...(assignedMembers.get(assignment.expenseItemId) ?? []),
      assignment.memberId,
    ]);
    if (assignment.weight != null) {
      assignedWeights.set(assignment.expenseItemId, {
        ...assignedWeights.get(assignment.expenseItemId),
        [assignment.memberId]: Number(assignment.weight),
      });
    }
  }

  const rosterIndex = (memberId: string) =>
    roster.findIndex((member) => member.id === memberId);
  const orderedSplits = [...splits].sort(
    (a, b) => rosterIndex(a.memberId) - rosterIndex(b.memberId),
  );
  const personById = new Map(roster.map((member) => [member.id, member]));
  const memberNames = new Map(
    roster.map((member) => [member.id, member.displayName]),
  );

  return {
    expense,
    roster,
    splits,
    orderedSplits,
    itemRows,
    assignedMembers,
    assignedWeights,
    personById,
    receiptBreakdown: (currency: string) =>
      receiptBreakdownFor({
        expense,
        currency,
        itemRows,
        assignedMembers,
        assignedWeights,
        memberNames,
        orderedSplits,
      }),
  };
}

export type ExpenseDetail = NonNullable<
  Awaited<ReturnType<typeof loadExpenseDetail>>
>;

function receiptBreakdownFor(input: {
  expense: Expense;
  currency: string;
  itemRows: Array<typeof expenseItems.$inferSelect>;
  assignedMembers: Map<string, string[]>;
  assignedWeights: Map<string, Record<string, number>>;
  memberNames: Map<string, string>;
  orderedSplits: Array<typeof expenseSplits.$inferSelect>;
}): ExpenseReceiptBreakdown {
  const { expense, currency, memberNames, orderedSplits } = input;
  if (expense.entryMode === "itemized" && input.itemRows.length > 0) {
    return buildItemizedReceiptBreakdown({
      currency,
      taxCents: expense.taxCents,
      tipCents: expense.tipCents,
      items: input.itemRows.map((item) => {
        const memberIds = input.assignedMembers.get(item.id) ?? [];
        return {
          description: item.description,
          amountCents: item.amountCents,
          quantity: item.quantity,
          memberIds,
          splitMode: item.splitMode,
          weights: input.assignedWeights.get(item.id) ?? null,
          sharedByNames: memberIds.map(
            (memberId) => memberNames.get(memberId) ?? "Someone",
          ),
        };
      }),
      memberNames,
      groupMemberIds: [...memberNames.keys()],
      storedSplits: orderedSplits.map((split) => ({
        memberId: split.memberId,
        amountCents: split.amountCents,
      })),
    });
  }
  return buildSimpleReceiptBreakdown({
    currency,
    amountCents: expense.amountCents,
    splitMode: expense.splitMode,
    shares: orderedSplits.map((split) => ({
      memberId: split.memberId,
      displayName: memberNames.get(split.memberId) ?? "Someone",
      amountCents: split.amountCents,
      weight: Number(split.weight ?? split.amountCents),
    })),
  });
}
