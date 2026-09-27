"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  removeExpenseAction,
  restoreExpenseAction,
} from "@/app/g/[id]/expenses/actions";
import { Button } from "@/components/ui/button";

export function DeleteExpenseButton({
  groupId,
  expenseId,
}: {
  groupId: string;
  expenseId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      try {
        await removeExpenseAction(groupId, expenseId);
        toast.success("Expense deleted", {
          action: {
            label: "Undo",
            onClick: () => {
              startTransition(async () => {
                try {
                  await restoreExpenseAction(groupId, expenseId);
                  router.push(`/g/${groupId}`);
                  router.refresh();
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Could not restore expense",
                  );
                }
              });
            },
          },
        });
        router.push(`/g/${groupId}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not delete expense",
        );
      }
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      className="mt-6 w-full"
      disabled={pending}
      onClick={onDelete}
    >
      {pending ? "Deleting…" : "Delete expense"}
    </Button>
  );
}
