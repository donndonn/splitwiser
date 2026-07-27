"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { removeMemberAction, renameMemberAction } from "./actions";

type MemberInfo = {
  id: string;
  displayName: string;
  isAdmin: boolean;
  isPlaceholder: boolean;
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

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar size="sm">
          <AvatarFallback>
            {member.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.displayName}
            {isSelf ? " (you)" : ""}
          </p>
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

      {(canRename || canRemove) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
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
