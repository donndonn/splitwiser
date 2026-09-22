"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { removeExpenseAction } from "@/app/g/[id]/expenses/actions";
import { SwipeableExpenseRow } from "@/components/swipeable-expense-row";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { expenseIconKind, viewerExpenseShare } from "@/lib/expense-row";
import { formatMoney } from "@/lib/money";
import { cn, groupedListClass } from "@/lib/utils";

export type RecentExpenseItem = {
  id: string;
  description: string;
  amountCents: number;
  month: string;
  day: string;
  paidByName: string;
  paidByViewer: boolean;
  viewerShareCents: number;
};

export function RecentExpensesList({
  groupId,
  currency,
  expenses: initialExpenses,
  archivedExpenses = [],
  settleMarkerLabel = null,
}: {
  groupId: string;
  currency: string;
  expenses: RecentExpenseItem[];
  archivedExpenses?: RecentExpenseItem[];
  settleMarkerLabel?: string | null;
}) {
  const [items, removeOptimistic] = useOptimistic(
    initialExpenses,
    (current, deletedId: string) =>
      current.filter((expense) => expense.id !== deletedId),
  );
  const [archived, removeArchivedOptimistic] = useOptimistic(
    archivedExpenses,
    (current, deletedId: string) =>
      current.filter((expense) => expense.id !== deletedId),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RecentExpenseItem | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const showHistory = archived.length > 0 && Boolean(settleMarkerLabel);

  function rowContent(expense: RecentExpenseItem) {
    const share = viewerExpenseShare({
      amountCents: expense.amountCents,
      paidByViewer: expense.paidByViewer,
      viewerShareCents: expense.viewerShareCents,
    });
    const payer = expense.paidByViewer ? "You" : expense.paidByName;
    return {
      description: expense.description,
      paidLabel: `${payer} paid ${formatMoney(expense.amountCents, currency)}`,
      month: expense.month,
      day: expense.day,
      icon: expenseIconKind(expense.description),
      share:
        share.kind === "borrowed" || share.kind === "lent"
          ? {
              kind: share.kind,
              amountLabel: formatMoney(share.amountCents, currency),
            }
          : { kind: share.kind },
    };
  }

  if (items.length === 0 && !showHistory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No expenses yet</CardTitle>
          <CardDescription>
            Add the first one to start splitting.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setOpenId(null);

    startTransition(async () => {
      removeOptimistic(target.id);
      removeArchivedOptimistic(target.id);
      try {
        await removeExpenseAction(groupId, target.id);
        toast.success("Expense deleted");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not delete expense",
        );
      }
    });
  }

  return (
    <>
      <div className={groupedListClass}>
        <ul className="divide-y divide-border">
          {items.map((e) => (
            <li key={e.id}>
              <SwipeableExpenseRow
                href={`/g/${groupId}/expenses/${e.id}`}
                {...rowContent(e)}
                open={openId === e.id}
                onOpenChange={(next) => setOpenId(next ? e.id : null)}
                onDeleteRequest={() => setPendingDelete(e)}
              />
            </li>
          ))}
          {showHistory ? (
            <li>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <span>
                  Earlier expenses settled
                  {settleMarkerLabel ? ` · ${settleMarkerLabel}` : ""}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    historyOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ) : null}
          {showHistory && historyOpen
            ? archived.map((e) => (
                <li key={e.id}>
                  <SwipeableExpenseRow
                    href={`/g/${groupId}/expenses/${e.id}`}
                    {...rowContent(e)}
                    open={openId === e.id}
                    onOpenChange={(next) => setOpenId(next ? e.id : null)}
                    onDeleteRequest={() => setPendingDelete(e)}
                  />
                </li>
              ))
            : null}
        </ul>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.description}” will be permanently deleted.`
                : "This expense will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
