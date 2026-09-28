"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { shareOrCopyInvite } from "@/lib/share-invite";
import { changeShareLinkAction } from "./actions";

type Confirm = "reset" | "disable" | null;

function shareUrl(token: string) {
  return `${window.location.origin}/s/${token}`;
}

export function SharePanel({
  groupId,
  groupName,
  token,
}: {
  groupId: string;
  groupName: string;
  token: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function share(current: string) {
    const result = await shareOrCopyInvite(shareUrl(current), groupName, {
      text: "See what you owe in our Splitwiser group",
    });
    if (result === "copied") toast.success("Share link copied");
    else if (result === "shared") toast.success("Share link shared");
  }

  function run(change: "create" | "reset" | "disable") {
    startTransition(async () => {
      try {
        const next = await changeShareLinkAction(groupId, change);
        setConfirm(null);
        router.refresh();
        if (change === "disable") {
          toast.success("Share link turned off");
        } else if (next) {
          await share(next);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update share link",
        );
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">View-only link</h3>
        <p className="text-xs text-muted-foreground">
          For friends without an account. Anyone with this link can see member
          names, expenses, and balances, but can’t change anything. Receipts
          and comments stay hidden.
        </p>
      </div>

      {token ? (
        <>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
            /s/{token}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              className="col-span-3"
              disabled={pending}
              onClick={() => startTransition(() => share(token))}
            >
              Share / Copy link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="col-span-2"
              disabled={pending}
              onClick={() => setConfirm("reset")}
            >
              Reset link
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirm("disable")}
            >
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={() => run("create")}
        >
          {pending ? "Creating…" : "Create view-only link"}
        </Button>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "reset"
                ? "Reset view-only link?"
                : "Turn off view-only link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "The current link stops working right away and a new one is created."
                : "The current link stops working right away. You can create a new one later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "disable" ? "destructive" : "default"}
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (confirm) run(confirm);
              }}
            >
              {confirm === "reset" ? "Reset link" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
