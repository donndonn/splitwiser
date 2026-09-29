"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LinkCandidate } from "@/lib/placeholder-links";
import { linkPlaceholderAction } from "./actions";

function candidateContext(candidate: LinkCandidate): string {
  const parts: string[] = [];
  if (candidate.username) parts.push(`@${candidate.username}`);
  if (candidate.sharedGroups.length > 0) {
    parts.push(`In ${candidate.sharedGroups.slice(0, 2).join(", ")}`);
  } else if (candidate.isFriend) {
    parts.push("Friend");
  }
  return parts.join(" · ");
}

function CandidateRow({
  candidate,
  disabled,
  onLink,
}: {
  candidate: LinkCandidate;
  disabled: boolean;
  onLink: () => void;
}) {
  const context = candidateContext(candidate);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar size="sm">
          {candidate.image && (
            <AvatarImage src={candidate.image} alt={candidate.displayName} />
          )}
          <AvatarFallback>
            {candidate.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {candidate.displayName}
          </p>
          {context && (
            <p className="truncate text-xs text-muted-foreground">{context}</p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={onLink}
      >
        Link
      </Button>
    </li>
  );
}

/**
 * Pick the account a placeholder belongs to. Name matches come first as
 * suggestions; nothing is linked until an admin picks someone.
 */
export function LinkAccountDialog({
  groupId,
  memberId,
  memberName,
  suggested,
  others,
  open,
  onOpenChange,
}: {
  groupId: string;
  memberId: string;
  memberName: string;
  suggested: LinkCandidate[];
  others: LinkCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function link(candidate: LinkCandidate) {
    startTransition(async () => {
      try {
        await linkPlaceholderAction(groupId, memberId, candidate.id);
        toast.success(`Linked ${memberName} to ${candidate.displayName}`);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not link");
      }
    });
  }

  const empty = suggested.length === 0 && others.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link {memberName} to an account</DialogTitle>
          <DialogDescription>
            They&apos;ll join this group as {memberName} and keep its expenses
            and balances. Removing them later unlinks the account.
          </DialogDescription>
        </DialogHeader>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Only your friends and people in your other groups can be linked.
            Nobody else is available yet.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {suggested.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">
                  Suggested
                </h3>
                <ul className="divide-y divide-border">
                  {suggested.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      disabled={pending}
                      onLink={() => link(candidate)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {others.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">
                  {suggested.length > 0 ? "Everyone else" : "People you know"}
                </h3>
                <ul className="divide-y divide-border">
                  {others.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      disabled={pending}
                      onLink={() => link(candidate)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
