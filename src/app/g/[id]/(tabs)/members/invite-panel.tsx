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
import type { InviteStatus } from "@/lib/invites";
import { changeInviteLinkAction } from "./actions";

export type InvitePanelInvite = {
  token: string;
  status: InviteStatus;
  expiresAt: string | null;
  uses: number;
  maxUses: number | null;
};

async function shareOrCopyInvite(url: string, groupTitle: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: groupTitle,
        text: "Join this Splitwiser group",
        url,
      });
      return "shared" as const;
    } catch (err) {
      // User cancelled the share sheet — don't fall through to clipboard.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  await navigator.clipboard.writeText(url);
  return "copied" as const;
}

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

function statusLabel(status: InviteStatus) {
  switch (status) {
    case "expired":
      return "This link has expired.";
    case "used_up":
      return "This link has reached its join limit.";
    case "revoked":
      return "This link is disabled.";
    case "live":
      return null;
  }
}

type Confirm = "reset" | "disable" | null;

export function InvitePanel({
  groupId,
  invite,
}: {
  groupId: string;
  invite: InvitePanelInvite | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const live = invite?.status === "live";

  async function share(token: string) {
    const result = await shareOrCopyInvite(
      inviteUrl(token),
      "Join my Splitwiser group",
    );
    if (result === "copied") toast.success("Invite link copied");
    else if (result === "shared") toast.success("Invite link shared");
  }

  function run(change: "create" | "reset" | "disable") {
    startTransition(async () => {
      try {
        const token = await changeInviteLinkAction(groupId, change);
        setConfirm(null);
        router.refresh();
        if (change === "disable") {
          toast.success("Invite link disabled");
        } else if (token) {
          await share(token);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update invite link",
        );
      }
    });
  }

  const expires = invite?.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString()
    : null;

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Invite link</h3>
        <p className="text-xs text-muted-foreground">
          Anyone with the link can join. Links last 30 days or 15 joins,
          whichever comes first.
        </p>
      </div>

      {invite ? (
        <div className="space-y-1 rounded-md bg-muted px-3 py-2">
          <p
            className={
              live
                ? "break-all font-mono text-xs"
                : "break-all font-mono text-xs text-muted-foreground line-through"
            }
          >
            /join/{invite.token}
          </p>
          <p className="text-xs text-muted-foreground">
            {invite.uses} of {invite.maxUses ?? "∞"} joins used
            {expires ? ` · ${live ? "expires" : "expired"} ${expires}` : ""}
          </p>
          {!live ? (
            <p className="text-xs font-medium">{statusLabel(invite.status)}</p>
          ) : null}
        </div>
      ) : null}

      {live && invite ? (
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            className="col-span-3"
            disabled={pending}
            onClick={() => startTransition(() => share(invite.token))}
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
            Disable
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() => run("create")}
        >
          {pending
            ? "Creating…"
            : invite
              ? "Create new link"
              : "Create link"}
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
              {confirm === "reset" ? "Reset invite link?" : "Disable invite link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "The current link stops working right away and a new one is created. People who already joined stay in the group."
                : "The current link stops working right away. People who already joined stay in the group."}
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
              {confirm === "reset" ? "Reset link" : "Disable link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
