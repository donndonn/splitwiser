import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExpenseForm } from "@/components/expense-form";
import { ReceiptPhoto } from "@/components/receipt-photo";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  expenseItemAssignments,
  expenseItems,
  expenseSplits,
  expenses,
  groups,
  members,
} from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { formatCents } from "@/lib/money";
import { deleteExpenseAction, updateExpenseAction } from "../actions";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  await requireMember(id);

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, id)))
    .limit(1);

  if (!group || !expense) notFound();

  const roster = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(eq(members.groupId, id))
    .orderBy(members.createdAt);

  const splits = await db
    .select()
    .from(expenseSplits)
    .where(eq(expenseSplits.expenseId, expenseId));

  const itemRows = await db
    .select()
    .from(expenseItems)
    .where(eq(expenseItems.expenseId, expenseId))
    .orderBy(expenseItems.sortOrder);

  const assignmentRows = await db
    .select({
      expenseItemId: expenseItemAssignments.expenseItemId,
      memberId: expenseItemAssignments.memberId,
    })
    .from(expenseItemAssignments)
    .innerJoin(
      expenseItems,
      eq(expenseItemAssignments.expenseItemId, expenseItems.id),
    )
    .where(eq(expenseItems.expenseId, expenseId));

  const assignedMembers = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    assignedMembers.set(assignment.expenseItemId, [
      ...(assignedMembers.get(assignment.expenseItemId) ?? []),
      assignment.memberId,
    ]);
  }

  const weights: Record<string, number> = {};
  for (const s of splits) {
    weights[s.memberId] = Number(s.weight ?? s.amountCents);
  }

  const action = updateExpenseAction.bind(null, id, expenseId);

  return (
    <AppShell title="Expense" backHref={`/g/${id}`}>
      <ExpenseForm
        members={roster}
        currency={group.currency}
        defaultPaidById={expense.paidByMemberId}
        action={action}
        submitLabel="Save changes"
        defaultValues={
          expense.entryMode === "itemized"
            ? {
                entryMode: "itemized",
                description: expense.description,
                amount: formatCents(expense.amountCents),
                paidByMemberId: expense.paidByMemberId,
                spentAt: expense.spentAt.toISOString().slice(0, 10),
                notes: expense.notes ?? undefined,
                tax: formatCents(expense.taxCents),
                tip: formatCents(expense.tipCents),
                items: itemRows.map((item) => ({
                  description: item.description,
                  amount: formatCents(item.amountCents),
                  quantity: item.quantity,
                  memberIds: assignedMembers.get(item.id) ?? [],
                })),
              }
            : {
                entryMode: "simple",
                description: expense.description,
                amount: formatCents(expense.amountCents),
                paidByMemberId: expense.paidByMemberId,
                spentAt: expense.spentAt.toISOString().slice(0, 10),
                splitMode: expense.splitMode,
                notes: expense.notes ?? undefined,
                weights,
                included: splits.map((split) => split.memberId),
              }
        }
      >
        {expense.receiptBlobPathname ? (
          <ReceiptPhoto expenseId={expense.id} />
        ) : null}
      </ExpenseForm>

      <form
        action={deleteExpenseAction.bind(null, id, expenseId)}
        className="mt-6"
      >
        <Button type="submit" variant="destructive" className="w-full">
          Delete expense
        </Button>
      </form>
    </AppShell>
  );
}
