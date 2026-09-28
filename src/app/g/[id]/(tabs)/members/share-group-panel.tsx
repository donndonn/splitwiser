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
import { shareOrCopyInvite } from "@/lib/share-invite";
import { cn } from "@/lib/utils";
import { changeInviteLinkAction, changeShareLinkAction } from "./actions";

export type ShareGroupInvite = {
  token: string;
  status: InviteStatus;
  expiresAt: string | null;
  uses: number;
  /** Unfinished signups holding one of this link's joins. */
  reserved: number;
  maxUses: number | null;
};

type Access = "view" | "join";
type Change = "create" | "reset" | "disable";

const accessCopy = {
  view: {
    label: "Can view",
    title: "View-only link",
    hint: "See expenses and balances, and pay on Venmo. No account needed.",
    shareText: "See what you owe in our Splitwiser group",
  },
  join: {
    label: "Can join",
    title: "Join link",
    hint: "Everything above, plus sign in to join and add expenses. Lasts 30 days or 15 joins.",
    shareText: "Join this Splitwiser group",
  },
} as const;

function linkPath(access: Access, token: string) {
  return access === "view" ? `/s/${token}` : `/join/${token}`;
}

function inviteStatusLabel(status: InviteStatus) {
  switch (status) {
    case "expired":
      return "This link has expired.";
    case "used_up":
      return "This link has reached its join limit (including pending signups).";
    case "revoked":
      return "This link is disabled.";
    case "live":
      return null;
  }
}

/**
 * One place to share a group. Each link's permission is fixed when it is
 * created, so a link already sent can never gain access; a view link and a
 * join link can be live at the same time.
 */
export function ShareGroupPanel({
  groupId,
  groupName,
  viewToken,
  invite,
}: {
  groupId: string;
  groupName: string;
  viewToken: string | null;
  invite: ShareGroupInvite | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<{
    access: Access;
    change: "reset" | "disable";
  } | null>(null);
  const joinLive = invite?.status === "live";
  const creatable: Access[] = [
    ...(viewToken ? [] : (["view"] as const)),
    ...(joinLive ? [] : (["join"] as const)),
  ];
  const [picked, setPicked] = useState<Access>("view");
  const createAccess = creatable.includes(picked) ? picked : creatable[0];

  async function share(access: Access, token: string) {
    const result = await shareOrCopyInvite(
      `${window.location.origin}${linkPath(access, token)}`,
      groupName,
      { text: accessCopy[access].shareText },
    );
    if (result === "copied") toast.success("Link copied");
    else if (result === "shared") toast.success("Link shared");
  }

  function run(access: Access, change: Change) {
    startTransition(async () => {
      try {
        const token =
          access === "view"
            ? await changeShareLinkAction(groupId, change)
            : await changeInviteLinkAction(groupId, change);
        setConfirm(null);
        router.refresh();
        if (change === "disable") {
          toast.success(`${accessCopy[access].title} turned off`);
        } else if (token) {
          await share(access, token);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update the link",
        );
      }
    });
  }

  const expires = invite?.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString()
    : null;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Share group</h3>
        <p className="text-xs text-muted-foreground">
          Anyone with a link can see member names, expenses with their items
          and receipt photos, and balances. Comments stay hidden.
        </p>
      </div>

      {viewToken ? (
        <LinkRow
          title={accessCopy.view.title}
          path={linkPath("view", viewToken)}
          pending={pending}
          onShare={() => startTransition(() => share("view", viewToken))}
          onReset={() => setConfirm({ access: "view", change: "reset" })}
          onDisable={() => setConfirm({ access: "view", change: "disable" })}
        />
      ) : null}

      {invite && joinLive ? (
        <LinkRow
          title={accessCopy.join.title}
          path={linkPath("join", invite.token)}
          detail={`${invite.uses} of ${invite.maxUses ?? "∞"} joins used${
            invite.reserved > 0
              ? ` · ${invite.reserved} pending signup${invite.reserved === 1 ? "" : "s"}`
              : ""
          }${expires ? ` · expires ${expires}` : ""}`}
          pending={pending}
          onShare={() => startTransition(() => share("join", invite.token))}
          onReset={() => setConfirm({ access: "join", change: "reset" })}
          onDisable={() => setConfirm({ access: "join", change: "disable" })}
        />
      ) : invite && invite.status !== "revoked" ? (
        <p className="text-xs text-muted-foreground">
          {accessCopy.join.title}: {inviteStatusLabel(invite.status)}
        </p>
      ) : null}

      {createAccess ? (
        <div className="space-y-3">
          {viewToken || joinLive ? (
            <p className="text-xs font-medium text-muted-foreground">
              Add another link
            </p>
          ) : null}
          <div
            role="radiogroup"
            aria-label="Link permission"
            className="grid gap-2"
          >
            {creatable.map((access) => (
              <button
                key={access}
                type="button"
                role="radio"
                aria-checked={createAccess === access}
                onClick={() => setPicked(access)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  createAccess === access
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted",
                )}
              >
                <span className="block text-sm font-medium">
                  {accessCopy[access].label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {accessCopy[access].hint}
                </span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={() => run(createAccess, "create")}
          >
            {pending
              ? "Creating…"
              : `Create ${accessCopy[createAccess].title.toLowerCase()}`}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm
                ? `${confirm.change === "reset" ? "Reset" : "Turn off"} ${accessCopy[confirm.access].title.toLowerCase()}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.change === "reset"
                ? "The current link stops working right away and a new one is created. People who already joined stay in the group."
                : "The current link stops working right away. People who already joined stay in the group."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.change === "disable" ? "destructive" : "default"}
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (confirm) run(confirm.access, confirm.change);
              }}
            >
              {confirm?.change === "reset" ? "Reset link" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinkRow({
  title,
  path,
  detail,
  pending,
  onShare,
  onReset,
  onDisable,
}: {
  title: string;
  path: string;
  detail?: string;
  pending: boolean;
  onShare: () => void;
  onReset: () => void;
  onDisable: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1 rounded-md bg-muted px-3 py-2">
        <p className="text-xs font-medium">{title}</p>
        <p className="break-all font-mono text-xs">{path}</p>
        {detail ? (
          <p className="text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" disabled={pending} onClick={onShare}>
          Share
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onReset}
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onDisable}
        >
          Turn off
        </Button>
      </div>
    </div>
  );
}
