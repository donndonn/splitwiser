"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createInviteAction } from "./actions";

export function CreateInviteForm({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="text-sm font-medium">Create invite link</h3>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              const token = await createInviteAction(groupId, formData);
              const url = `${window.location.origin}/join/${token}`;
              setLink(url);
              await navigator.clipboard.writeText(url);
              toast.success("Invite link copied");
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
          {pending ? "Creating…" : "Create & copy link"}
        </Button>
      </form>
      {link && (
        <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{link}</p>
      )}
    </div>
  );
}
