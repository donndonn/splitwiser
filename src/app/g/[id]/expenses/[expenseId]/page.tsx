import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseReadView } from "@/components/expense-read-view";
import { ReceiptAttach } from "@/components/receipt-attach";
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
  users,
} from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  buildItemizedReceiptBreakdown,
  buildSimpleReceiptBreakdown,
  type ExpenseReceiptBreakdown,
} from "@/lib/expense-receipt-breakdown";
import { formatCents, formatMoney } from "@/lib/money";
import {
  attachReceiptAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "../actions";

function formatAddedOn(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; expenseId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id, expenseId } = await params;
  const { edit } = await searchParams;
  const editing = edit === "1";
  await requireMember(id);

  const [[group], [expense]] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, id)))
      .limit(1),
  ]);

  if (!group || !expense) notFound();

  const [roster, splits, itemRows, assignmentRows] = await Promise.all([
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        image: users.image,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
    db
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId)),
    db
      .select()
      .from(expenseItems)
      .where(eq(expenseItems.expenseId, expenseId))
      .orderBy(expenseItems.sortOrder),
    db
      .select({
        expenseItemId: expenseItemAssignments.expenseItemId,
        memberId: expenseItemAssignments.memberId,
      })
      .from(expenseItemAssignments)
      .innerJoin(
        expenseItems,
        eq(expenseItemAssignments.expenseItemId, expenseItems.id),
      )
      .where(eq(expenseItems.expenseId, expenseId)),
  ]);

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
  const personById = new Map(roster.map((member) => [member.id, member]));
  const payer = personById.get(expense.paidByMemberId);
  const creator = personById.get(expense.createdByMemberId);
  const hasReceipt = Boolean(expense.receiptBlobPathname);
  const amountLabel = formatMoney(expense.amountCents, group.currency);

  const memberNames = new Map(
    roster.map((member) => [member.id, member.displayName]),
  );

  let receiptBreakdown: ExpenseReceiptBreakdown;
  if (expense.entryMode === "itemized" && itemRows.length > 0) {
    receiptBreakdown = buildItemizedReceiptBreakdown({
      currency: group.currency,
      taxCents: expense.taxCents,
      tipCents: expense.tipCents,
      items: itemRows.map((item) => {
        const memberIds = assignedMembers.get(item.id) ?? [];
        return {
          description: item.description,
          amountCents: item.amountCents,
          quantity: item.quantity,
          memberIds,
          sharedByNames: memberIds.map(
            (memberId) => memberNames.get(memberId) ?? "Someone",
          ),
        };
      }),
      memberNames,
      storedSplits: splits.map((split) => ({
        memberId: split.memberId,
        amountCents: split.amountCents,
      })),
    });
  } else {
    receiptBreakdown = buildSimpleReceiptBreakdown({
      currency: group.currency,
      amountCents: expense.amountCents,
      splitMode: expense.splitMode,
      shares: [...splits]
        .sort(
          (a, b) =>
            roster.findIndex((member) => member.id === a.memberId) -
            roster.findIndex((member) => member.id === b.memberId),
        )
        .map((split) => ({
          memberId: split.memberId,
          displayName: personById.get(split.memberId)?.displayName ?? "Someone",
          amountCents: split.amountCents,
          weight: Number(split.weight ?? split.amountCents),
        })),
    });
  }

  const form = (
    <ExpenseForm
      members={roster}
      currency={group.currency}
      defaultPaidById={expense.paidByMemberId}
      action={action}
      submitLabel="Save changes"
      allowReceiptUpload={!hasReceipt}
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
      {hasReceipt ? (
        <ReceiptPhoto expenseId={expense.id} collapsible={false} />
      ) : null}
    </ExpenseForm>
  );

  return (
    <AppShell
      title="Expense"
      backHref={editing ? `/g/${id}/expenses/${expenseId}` : `/g/${id}`}
      actions={
        editing ? null : (
          <Button asChild variant="outline" size="sm">
            <Link href={`/g/${id}/expenses/${expenseId}?edit=1`}>Edit</Link>
          </Button>
        )
      }
    >
      {editing ? (
        form
      ) : (
        <ExpenseReadView
          description={expense.description}
          amountLabel={amountLabel}
          addedByLine={`Added by ${creator?.displayName ?? payer?.displayName ?? "someone"} on ${formatAddedOn(expense.createdAt)}`}
          payer={{
            displayName: payer?.displayName ?? "Someone",
            image: payer?.image ?? null,
          }}
          shares={[...splits]
            .sort(
              (a, b) =>
                roster.findIndex((member) => member.id === a.memberId) -
                roster.findIndex((member) => member.id === b.memberId),
            )
            .map((split) => {
              const person = personById.get(split.memberId);
              return {
                memberId: split.memberId,
                displayName: person?.displayName ?? "Someone",
                image: person?.image ?? null,
                amountCents: split.amountCents,
                amountLabel: formatMoney(split.amountCents, group.currency),
              };
            })}
          notes={expense.notes}
          receiptBreakdown={receiptBreakdown}
          receipt={
            hasReceipt ? (
              <ReceiptPhoto expenseId={expense.id} />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Receipt photo</p>
                <ReceiptAttach
                  action={attachReceiptAction.bind(null, id, expenseId)}
                />
              </div>
            )
          }
        />
      )}

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
