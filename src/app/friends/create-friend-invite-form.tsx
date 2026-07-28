"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createFriendInviteAction } from "./actions";

async function shareOrCopyInvite(url: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Add me on Splitwiser",
        text: "Join me as a friend on Splitwiser",
        url,
      });
      return "shared" as const;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  await navigator.clipboard.writeText(url);
  return "copied" as const;
}

export function CreateFriendInviteForm() {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="text-sm font-medium">Invite a friend</h3>
      <p className="text-xs text-muted-foreground">
        Share a link so someone can add you as a friend after they sign in.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              const token = await createFriendInviteAction(formData);
              const url = `${window.location.origin}/friends/join/${token}`;
              setLink(url);
              const result = await shareOrCopyInvite(url);
              if (result === "copied") {
                toast.success("Friend invite link copied");
              } else if (result === "shared") {
                toast.success("Friend invite link shared");
              }
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not create invite",
              );
            }
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="expiresIn">Expires</Label>
            <NativeSelect id="expiresIn" name="expiresIn" defaultValue="7d">
              <option value="1d">1 day</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="never">Never</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxUses">Max uses</Label>
            <Input
              id="maxUses"
              name="maxUses"
              type="number"
              min={1}
              placeholder="Unlimited"
            />
          </div>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create & share link"}
        </Button>
      </form>
      {link && (
        <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{link}</p>
      )}
    </div>
  );
}
