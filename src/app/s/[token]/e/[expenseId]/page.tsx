import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExpenseReadView } from "@/components/expense-read-view";
import { ReceiptPhoto } from "@/components/receipt-photo";
import { db } from "@/db";
import { loadExpenseDetail } from "@/lib/expense-detail";
import { formatMoney } from "@/lib/money";
import { getSharedGroup, sharedReceiptPath } from "@/lib/share-link";
import { sharedGroupHref } from "../../shared-href";

function formatAddedOn(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** One expense for a view-only link: items, shares, and the receipt photo. */
export default async function SharedExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; expenseId: string }>;
  searchParams: Promise<{ me?: string | string[] }>;
}) {
  const [{ token, expenseId }, { me }] = await Promise.all([
    params,
    searchParams,
  ]);
  const group = await getSharedGroup(db, token);
  if (!group) notFound();
  const detail = await loadExpenseDetail(db, { groupId: group.id, expenseId });
  if (!detail) notFound();

  const { expense, orderedSplits, personById } = detail;
  const viewerId = typeof me === "string" && personById.has(me) ? me : null;
  const nameOf = (memberId: string) =>
    personById.get(memberId)?.displayName ?? "Someone";
  const amountLabel = formatMoney(expense.amountCents, group.currency);

  return (
    <AppShell title="Expense" backHref={sharedGroupHref(token, viewerId)}>
      {/* Profile photos stay out of view-only pages; initials only. */}
      <ExpenseReadView
        description={expense.description}
        amountLabel={amountLabel}
        addedByLine={`Added by ${nameOf(expense.createdByMemberId)} on ${formatAddedOn(expense.createdAt)}`}
        payer={{ displayName: nameOf(expense.paidByMemberId), image: null }}
        shares={orderedSplits.map((split) => ({
          memberId: split.memberId,
          displayName: nameOf(split.memberId),
          image: null,
          amountCents: split.amountCents,
          amountLabel: formatMoney(split.amountCents, group.currency),
        }))}
        notes={expense.notes}
        receiptBreakdown={detail.receiptBreakdown(group.currency)}
        receipt={
          expense.receiptBlobPathname ? (
            <ReceiptPhoto
              expenseId={expense.id}
              src={sharedReceiptPath(token, expense.id)}
              caption="Receipt photo"
            />
          ) : null
        }
      />
    </AppShell>
  );
}
