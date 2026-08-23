"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { recordSettlementAction } from "./actions";

type MemberOption = { id: string; displayName: string };

export function RecordPaymentForm({
  groupId,
  members,
  currency,
  currentMemberId,
  defaults,
  onSuccess,
}: {
  groupId: string;
  members: MemberOption[];
  currency: string;
  currentMemberId?: string;
  defaults?: { fromMemberId?: string; toMemberId?: string; amount?: string };
  onSuccess?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const defaultFrom = defaults?.fromMemberId ?? currentMemberId;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        startTransition(async () => {
          try {
            await recordSettlementAction(groupId, fd);
            toast.success("Payment recorded");
            form.reset();
            onSuccess?.();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Could not record payment",
            );
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fromMemberId">From</Label>
          <NativeSelect
            id="fromMemberId"
            name="fromMemberId"
            defaultValue={defaultFrom}
            required
          >
            <option value="">Who paid</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.id === currentMemberId ? " (you)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="toMemberId">To</Label>
          <NativeSelect
            id="toMemberId"
            name="toMemberId"
            defaultValue={defaults?.toMemberId}
            required
          >
            <option value="">Who received</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.id === currentMemberId ? " (you)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount ({currency})</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={defaults?.amount}
          placeholder="0.00"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" placeholder="Venmo, cash…" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}
