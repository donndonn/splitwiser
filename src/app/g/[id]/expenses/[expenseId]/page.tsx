import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExpenseComments } from "@/components/expense-comments";
import { ExpenseDetailActions } from "@/components/expense-detail-actions";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseReadView } from "@/components/expense-read-view";
import { ReceiptAttach } from "@/components/receipt-attach";
import { ReceiptPhoto } from "@/components/receipt-photo";
import { db } from "@/db";
import { expenseComments, groups } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { canDeleteComment } from "@/lib/expense-comments";
import { loadExpenseDetail } from "@/lib/expense-detail";
import { formatCents, formatMoney } from "@/lib/money";
import { attachReceiptAction, updateExpenseAction } from "../actions";
import {
  addExpenseCommentAction,
  deleteExpenseCommentAction,
} from "../comment-actions";

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
  const { member: viewer } = await requireMember(id);

  const [[group], detail, commentRows] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    loadExpenseDetail(db, { groupId: id, expenseId }),
    db
      .select()
      .from(expenseComments)
      .where(eq(expenseComments.expenseId, expenseId))
      .orderBy(asc(expenseComments.createdAt), asc(expenseComments.id)),
  ]);

  if (!group || !detail) notFound();

  const {
    expense,
    roster,
    splits,
    orderedSplits,
    itemRows,
    assignedMembers,
    assignedWeights,
    personById,
  } = detail;

  const weights: Record<string, number> = {};
  for (const s of splits) {
    weights[s.memberId] = Number(s.weight ?? s.amountCents);
  }

  const action = updateExpenseAction.bind(null, id, expenseId);
  const payer = personById.get(expense.paidByMemberId);
  const creator = personById.get(expense.createdByMemberId);
  const hasReceipt = Boolean(expense.receiptBlobPathname);
  const amountLabel = formatMoney(expense.amountCents, group.currency);
  const receiptBreakdown = detail.receiptBreakdown(group.currency);

  const form = (
    <ExpenseForm
      members={roster}
      currency={group.currency}
      defaultPaidById={expense.paidByMemberId}
      action={action}
      submitLabel="Save changes"
      pinnedSubmit
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
                splitMode: item.splitMode,
                weights: assignedWeights.get(item.id),
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
      lockViewport={editing}
      actions={
        <ExpenseDetailActions
          groupId={id}
          expenseId={expenseId}
          description={expense.description}
          showEdit={!editing}
        />
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
          shares={orderedSplits
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

      {editing ? null : (
        <ExpenseComments
          comments={commentRows.map((comment) => {
            const author = comment.authorMemberId
              ? personById.get(comment.authorMemberId)
              : undefined;
            return {
              id: comment.id,
              body: comment.body,
              createdAt: comment.createdAt,
              authorName: author?.displayName ?? "Former member",
              authorImage: author?.image ?? null,
              canDelete: canDeleteComment(comment, viewer),
            };
          })}
          addAction={addExpenseCommentAction.bind(null, id, expenseId)}
          deleteAction={deleteExpenseCommentAction.bind(null, id, expenseId)}
        />
      )}
    </AppShell>
  );
}
