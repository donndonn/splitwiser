"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { SwipeableRow } from "@/components/swipeable-row";
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
import { formatMoney } from "@/lib/money";
import { groupedListClass } from "@/lib/utils";
import { reverseSettlementAction } from "./actions";

export type RecentPaymentItem = {
  id: string;
  fromName: string;
  toName: string;
  amountCents: number;
  note: string | null;
  settledAtLabel: string;
};

export function RecentPaymentsList({
  groupId,
  currency,
  payments: initialPayments,
}: {
  groupId: string;
  currency: string;
  payments: RecentPaymentItem[];
}) {
  const [items, removeOptimistic] = useOptimistic(
    initialPayments,
    (current, deletedId: string) =>
      current.filter((payment) => payment.id !== deletedId),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecentPaymentItem | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  function confirmReverse() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setOpenId(null);

    startTransition(async () => {
      removeOptimistic(target.id);
      try {
        await reverseSettlementAction(groupId, target.id);
        toast.success("Payment undone");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not undo payment",
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Recent payments
      </h2>
      <div className={groupedListClass}>
        <ul className="divide-y divide-border">
          {items.map((payment) => (
            <li key={payment.id}>
              <SwipeableRow
                open={openId === payment.id}
                onOpenChange={(next) => setOpenId(next ? payment.id : null)}
                onAction={() => setPendingDelete(payment)}
                actionLabel="Undo"
                actionAriaLabel={`Undo payment from ${payment.fromName} to ${payment.toName}`}
                actionIcon={<Undo2 className="size-4" />}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {payment.fromName} → {payment.toName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {payment.settledAtLabel}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {formatMoney(payment.amountCents, currency)}
                  </span>
                </div>
              </SwipeableRow>
            </li>
          ))}
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
            <AlertDialogTitle>Undo this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.fromName} → ${pendingDelete.toName} · ${formatMoney(pendingDelete.amountCents, currency)} will go back on the group balances.`
                : "This payment will go back on the group balances."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmReverse();
              }}
            >
              {pending ? "Undoing…" : "Undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
