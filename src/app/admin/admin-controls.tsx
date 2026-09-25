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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteStalePendingUsersAction,
  revokeInviteAction,
  setMaxUsersAction,
} from "./actions";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function MaxUsersForm({
  maxUsers,
  total,
}: {
  maxUsers: number | null;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(maxUsers == null ? "" : String(maxUsers));
  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  const unchanged = valid && parsed === maxUsers;

  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        startTransition(async () => {
          try {
            await setMaxUsersAction(parsed);
            router.refresh();
            toast.success(
              parsed === 0 ? "Signups paused" : `Cap set to ${parsed}`,
            );
          } catch (err) {
            toast.error(errorMessage(err, "Could not update the cap"));
          }
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="max-users" className="text-sm font-medium">
          Account cap
        </Label>
        <p className="text-xs text-muted-foreground">
          New signups are refused once this many accounts exist. 0 pauses
          signups. Existing accounts always keep signing in.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          id="max-users"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !valid || unchanged}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {valid && !unchanged && parsed > 0 && parsed < total ? (
        <p className="text-xs font-medium text-destructive">
          Below the current {total} accounts. No one is removed; new signups
          stay blocked until accounts drop under the cap.
        </p>
      ) : null}
      {maxUsers != null && maxUsers !== 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0"
          disabled={pending}
          onClick={() => setValue("0")}
        >
          Pause signups
        </Button>
      ) : null}
    </form>
  );
}

export function StalePendingPanel({
  stalePending,
  pending: pendingCount,
  days,
}: {
  stalePending: number;
  pending: number;
  days: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Unfinished signups</h3>
        <p className="text-xs text-muted-foreground">
          Accounts that signed in but never joined a group. Each holds a cap
          slot and one join on its invite link. {pendingCount} pending,{" "}
          {stalePending} older than {days} days.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy || stalePending === 0}
        onClick={() => setConfirming(true)}
      >
        {stalePending === 0
          ? "Nothing to clear"
          : `Delete ${stalePending} stale signup${stalePending === 1 ? "" : "s"}`}
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stale signups?</AlertDialogTitle>
            <AlertDialogDescription>
              Pending accounts older than {days} days are deleted, freeing their
              cap slots and invite joins. They can sign up again with a new
              invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  try {
                    const deleted = await deleteStalePendingUsersAction();
                    setConfirming(false);
                    router.refresh();
                    toast.success(
                      `Deleted ${deleted} signup${deleted === 1 ? "" : "s"}`,
                    );
                  } catch (err) {
                    toast.error(errorMessage(err, "Could not delete signups"));
                  }
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RevokeInviteButton({
  inviteId,
  groupName,
}: {
  inviteId: string;
  groupName: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Revoke
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {groupName}’s link?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working right away. Members who already joined
              stay; group admins can create a new link from Members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  try {
                    await revokeInviteAction(inviteId);
                    setConfirming(false);
                    router.refresh();
                    toast.success("Invite link revoked");
                  } catch (err) {
                    toast.error(errorMessage(err, "Could not revoke link"));
                  }
                });
              }}
            >
              Revoke link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
