"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  dismissSettlePromptAction,
  markGroupSettledAction,
} from "@/app/g/[id]/settle/actions";
import { Button } from "@/components/ui/button";

export function MarkAsSettledPrompt({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    startTransition(async () => {
      try {
        await dismissSettlePromptAction(groupId);
        router.refresh();
      } catch (err) {
        setHidden(false);
        toast.error(
          err instanceof Error ? err.message : "Could not dismiss",
        );
      }
    });
  }

  function confirm() {
    setHidden(true);
    startTransition(async () => {
      try {
        await markGroupSettledAction(groupId);
        toast.success("Marked as settled");
        router.refresh();
      } catch (err) {
        setHidden(false);
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not mark as settled",
        );
      }
    });
  }

  return (
    <section className="mb-6 border-b border-border/70 bg-accent/45 px-4 py-4">
      <h2 className="text-sm font-semibold">Everyone&apos;s settled up</h2>
      <p className="mt-1 text-sm text-muted-foreground">
          Mark as settled? Recent expenses will only show what happens after
          this point. Earlier ones stay in history.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={dismiss}
        >
          Not now
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={confirm}>
          Mark as settled
        </Button>
      </div>
    </section>
  );
}
