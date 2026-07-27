"use client";

import { useOptimistic, useState, useTransition } from "react";
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
import { formatMoney } from "@/lib/money";

export type RecentExpenseItem = {
  id: string;
  description: string;
  amountCents: number;
  spentAtLabel: string;
  paidByName: string;
};

export function RecentExpensesList({
  groupId,
  currency,
  expenses: initialExpenses,
}: {
  groupId: string;
  currency: string;
  expenses: RecentExpenseItem[];
}) {
  const [items, removeOptimistic] = useOptimistic(
    initialExpenses,
    (current, deletedId: string) =>
      current.filter((expense) => expense.id !== deletedId),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecentExpenseItem | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
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
      <ul className="space-y-2">
        {items.map((e) => (
          <li key={e.id}>
            <SwipeableExpenseRow
              href={`/g/${groupId}/expenses/${e.id}`}
              description={e.description}
              subtitle={`${e.paidByName} · ${e.spentAtLabel}`}
              amountLabel={formatMoney(e.amountCents, currency)}
              open={openId === e.id}
              onOpenChange={(next) => setOpenId(next ? e.id : null)}
              onDeleteRequest={() => setPendingDelete(e)}
            />
          </li>
        ))}
      </ul>

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
