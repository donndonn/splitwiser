"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  addFriendAsMemberAction,
  addPlaceholderAction,
  changeInviteLinkAction,
  type AddedMember,
} from "@/app/g/[id]/(tabs)/members/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { inviteUrl, shareOrCopyInvite } from "@/lib/share-invite";
import { cn } from "@/lib/utils";

export type AddPersonFriend = {
  id: string;
  displayName: string;
  email: string | null;
  image: string | null;
};

type PanelProps = {
  groupId: string;
  /** Friends not yet in the group. */
  friends: AddPersonFriend[];
  initialName?: string;
  /** Runs as soon as the member exists. */
  onAdded: (member: AddedMember) => void;
  /** Runs when the flow is finished (after the invite prompt, for a name). */
  onDone: () => void;
};

/**
 * Add a friend, or add someone by name and offer them the invite link.
 * A name becomes a placeholder they claim when they join through the link.
 */
export function AddPersonPanel({
  groupId,
  friends,
  initialName,
  onAdded,
  onDone,
}: PanelProps) {
  const [name, setName] = useState(initialName ?? "");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [invitee, setInvitee] = useState<AddedMember | null>(null);
  const [pending, startTransition] = useTransition();

  const remainingFriends = friends.filter(
    (friend) => !addedIds.includes(friend.id),
  );

  function addFriend(friend: AddPersonFriend) {
    startTransition(async () => {
      try {
        const member = await addFriendAsMemberAction(groupId, friend.id);
        setAddedIds((ids) => [...ids, friend.id]);
        onAdded(member);
        toast.success(`Added ${member.displayName}`);
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add friend");
      }
    });
  }

  function addByName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const member = await addPlaceholderAction(groupId, formData);
        setName("");
        onAdded(member);
        setInvitee(member);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add person");
      }
    });
  }

  function shareInvite() {
    startTransition(async () => {
      try {
        const token = await changeInviteLinkAction(groupId, "create");
        if (!token) throw new Error("Could not create invite link");
        const result = await shareOrCopyInvite(
          inviteUrl(token),
          "Join my Splitwiser group",
        );
        if (result === "cancelled") return;
        toast.success(
          result === "copied" ? "Invite link copied" : "Invite link shared",
        );
        onDone();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not share invite link",
        );
      }
    });
  }

  if (invitee) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{invitee.displayName} added</p>
          <p className="text-sm text-muted-foreground">
            Send them the invite link. When they join, they pick their name and
            see everything they&apos;re part of.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={pending}
            onClick={shareInvite}
          >
            <Share2 className="size-4" />
            {pending ? "Preparing link…" : "Share invite link"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onDone}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {remainingFriends.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">From friends</h3>
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {remainingFriends.map((friend) => (
              <li key={friend.id} className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarImage src={friend.image ?? undefined} alt="" />
                  <AvatarFallback>
                    {friend.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {friend.displayName}
                  </p>
                  {friend.email ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {friend.email}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => addFriend(friend)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">By name</h3>
        <p className="text-xs text-muted-foreground">
          Not on Splitwiser yet? Add their name and send them the invite link.
        </p>
        <form onSubmit={addByName} className="flex gap-2">
          <Input
            name="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoComplete="off"
            required
            disabled={pending}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || !name.trim()}
          >
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

export function AddPersonSheet({
  open,
  onOpenChange,
  ...panel
}: Omit<PanelProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto max-h-[min(36rem,90vh)] max-w-lg overflow-y-auto rounded-t-3xl border-border/70",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Add someone</SheetTitle>
          <SheetDescription>
            They join this group and can be part of the split.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-2">
          {/* Mounted only while open, so each opening starts fresh with its prefill. */}
          {open ? (
            <AddPersonPanel {...panel} onDone={() => onOpenChange(false)} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
