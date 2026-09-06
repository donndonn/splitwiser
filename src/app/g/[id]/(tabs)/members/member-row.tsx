"use client";

import { useState, useTransition } from "react";
import { Check, Clock, MoreVertical, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { sendFriendRequestAction } from "@/app/friends/actions";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { FriendStatus } from "@/lib/friends";
import { removeMemberAction, renameMemberAction } from "./actions";

type MemberInfo = {
  id: string;
  displayName: string;
  isAdmin: boolean;
  isPlaceholder: boolean;
  userId: string | null;
  username: string | null;
  image: string | null;
  friendStatus: FriendStatus | null;
};

export function MemberRow({
  groupId,
  member,
  isSelf,
  canRename,
  canRemove,
}: {
  groupId: string;
  member: MemberInfo;
  isSelf: boolean;
  canRename: boolean;
  canRemove: boolean;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [friendPending, startFriendTransition] = useTransition();

  function handleFriendAction() {
    if (!member.userId || !member.friendStatus) return;
    const targetUserId = member.userId;
    const accepted = member.friendStatus === "incoming";

    startFriendTransition(async () => {
      try {
        await sendFriendRequestAction(targetUserId);
        toast.success(
          accepted ? "Friend request accepted" : "Friend request sent",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update friendship",
        );
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar size="sm">
          {member.image && (
            <AvatarImage src={member.image} alt={member.displayName} />
          )}
          <AvatarFallback>
            {member.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.displayName}
            {isSelf ? " (you)" : ""}
          </p>
          {member.username && (
            <p className="truncate text-xs text-muted-foreground">
              @{member.username}
            </p>
          )}
          {(member.isAdmin || member.isPlaceholder) && (
            <div className="mt-0.5 flex gap-1">
              {member.isAdmin && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  Admin
                </Badge>
              )}
              {member.isPlaceholder && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  Placeholder
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!isSelf && member.userId && member.friendStatus === "none" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={friendPending}
            onClick={handleFriendAction}
          >
            <UserPlus />
            Add friend
          </Button>
        )}
        {!isSelf && member.userId && member.friendStatus === "incoming" && (
          <Button
            type="button"
            size="sm"
            disabled={friendPending}
            onClick={handleFriendAction}
          >
            <UserPlus />
            Accept
          </Button>
        )}
        {!isSelf && member.userId && member.friendStatus === "outgoing" && (
          <Button type="button" size="sm" variant="ghost" disabled>
            <Clock />
            Requested
          </Button>
        )}
        {!isSelf && member.userId && member.friendStatus === "friends" && (
          <Button type="button" size="sm" variant="ghost" disabled>
            <Check />
            Friends
          </Button>
        )}

        {(canRename || canRemove) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${member.displayName}`}
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canRename && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setRenameOpen(true);
                  }}
                >
                  Rename
                </DropdownMenuItem>
              )}
              {canRemove && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setRemoveOpen(true);
                  }}
                >
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {canRename && (
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename member</DialogTitle>
            </DialogHeader>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  try {
                    await renameMemberAction(groupId, member.id, fd);
                    setRenameOpen(false);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Could not rename",
                    );
                  }
                });
              }}
            >
              <Input
                name="displayName"
                defaultValue={member.displayName}
                autoFocus
                required
              />
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canRemove && (
        <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {member.displayName}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                They&apos;ll lose access to this group. Expense history is
                kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  startTransition(async () => {
                    try {
                      await removeMemberAction(groupId, member.id);
                      setRemoveOpen(false);
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Could not remove member",
                      );
                    }
                  });
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
