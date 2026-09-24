"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addFriendAsMemberAction } from "./actions";

type FriendOption = {
  id: string;
  displayName: string;
  email: string | null;
  image: string | null;
};

export function AddFriendsToGroup({
  groupId,
  friends,
}: {
  groupId: string;
  friends: FriendOption[];
}) {
  const [pending, startTransition] = useTransition();

  if (friends.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border p-4">
        <h3 className="text-sm font-medium">Add from friends</h3>
        <p className="text-xs text-muted-foreground">
          No friends left to add. Invite someone from Friends, or they may
          already be in this group.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <h3 className="text-sm font-medium">Add from friends</h3>
        <p className="text-xs text-muted-foreground">
          Adds them as a linked member right away — no invite claim needed.
        </p>
      </div>
      <ul className="space-y-2">
        {friends.map((friend) => (
          <li key={friend.id} className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={friend.image ?? undefined} alt="" />
              <AvatarFallback>
                {friend.displayName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{friend.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {friend.email}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await addFriendAsMemberAction(groupId, friend.id);
                    toast.success(`Added ${friend.displayName}`);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Could not add friend",
                    );
                  }
                });
              }}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
