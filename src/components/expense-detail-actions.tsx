"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import {
  removeExpenseAction,
  restoreExpenseAction,
} from "@/app/g/[id]/expenses/actions";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExpenseDetailActions({
  groupId,
  expenseId,
  description,
}: {
  groupId: string;
  expenseId: string;
  description: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
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
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/g/${groupId}/expenses/${expenseId}?edit=1`}>Edit</Link>
      </Button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${description}`}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{description}”?</AlertDialogTitle>
            <AlertDialogDescription>
              “{description}” will be deleted.
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
