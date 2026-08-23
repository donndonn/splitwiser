"use client";

import { useState, useTransition } from "react";
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
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCents, formatMoney } from "@/lib/money";
import { paymentActionLabel } from "@/lib/settlement-copy";
import { groupedListClass } from "@/lib/utils";
import { recordSettlementAction, settleGroupAction } from "./actions";
import { RecordPaymentForm } from "./record-payment-form";

export type SettleSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

type MemberOption = { id: string; displayName: string };

export function SettleUpSection({
  groupId,
  currency,
  currentMemberId,
  members,
  suggestions,
}: {
  groupId: string;
  currency: string;
  currentMemberId: string;
  members: MemberOption[];
  suggestions: SettleSuggestion[];
}) {
  const [pending, startTransition] = useTransition();
  const [settleOpen, setSettleOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<SettleSuggestion | null>(null);

  const nameById = new Map(members.map((m) => [m.id, m.displayName]));

  function labelFor(suggestion: SettleSuggestion) {
    return paymentActionLabel(
      suggestion.fromMemberId,
      suggestion.toMemberId,
      currentMemberId,
      nameById.get(suggestion.fromMemberId) ?? "Someone",
      nameById.get(suggestion.toMemberId) ?? "someone",
    );
  }

  function confirmRecordSuggestion() {
    if (!pendingSuggestion) return;
    const suggestion = pendingSuggestion;
    setPendingSuggestion(null);

    const fd = new FormData();
    fd.set("fromMemberId", suggestion.fromMemberId);
    fd.set("toMemberId", suggestion.toMemberId);
    fd.set("amount", formatCents(suggestion.amountCents));

    startTransition(async () => {
      try {
        await recordSettlementAction(groupId, fd);
        toast.success("Payment recorded");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not record payment",
        );
      }
    });
  }

  function confirmSettleGroup() {
    setSettleOpen(false);
    startTransition(async () => {
      try {
        await settleGroupAction(groupId);
        toast.success("Group settled");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not settle the group",
        );
      }
    });
  }

  const recordSheet = (
    <RecordPaymentSheet
      open={recordOpen}
      onOpenChange={setRecordOpen}
      groupId={groupId}
      members={members}
      currency={currency}
      currentMemberId={currentMemberId}
    />
  );

  if (suggestions.length === 0) {
    return (
      <div className="mb-6 space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All settled</CardTitle>
            <CardDescription>Everyone is even. Nice work.</CardDescription>
          </CardHeader>
        </Card>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setRecordOpen(true)}
        >
          Record a payment
        </Button>
        {recordSheet}
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => setSettleOpen(true)}
      >
        Settle group
      </Button>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Suggested payments
        </h2>
        <p className="text-xs text-muted-foreground">
          Record a payment after the money has actually moved, or settle
          everyone at once.
        </p>
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {suggestions.map((suggestion) => (
              <li
                key={`${suggestion.fromMemberId}-${suggestion.toMemberId}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <p className="min-w-0 truncate text-sm">
                  {labelFor(suggestion)}{" "}
                  <span className="font-medium">
                    {formatMoney(suggestion.amountCents, currency)}
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => setPendingSuggestion(suggestion)}
                >
                  Record
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setRecordOpen(true)}
      >
        Record a different payment
      </Button>

      <AlertDialog open={settleOpen} onOpenChange={setSettleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settle the group?</AlertDialogTitle>
            <AlertDialogDescription>
              This records the suggested payments and zeros everyone&apos;s
              balance. Continue only after the money has moved, or if
              you&apos;ve agreed to call it even.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
            {suggestions.map((suggestion) => (
              <li
                key={`${suggestion.fromMemberId}-${suggestion.toMemberId}`}
                className="flex justify-between gap-3"
              >
                <span className="min-w-0 truncate">
                  {labelFor(suggestion)}
                </span>
                <span className="shrink-0 font-medium">
                  {formatMoney(suggestion.amountCents, currency)}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmSettleGroup();
              }}
            >
              {pending ? "Settling…" : "Settle group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingSuggestion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSuggestion(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Record this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSuggestion
                ? `${labelFor(pendingSuggestion)} ${formatMoney(pendingSuggestion.amountCents, currency)}. This will update the group balances.`
                : "This will update the group balances."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmRecordSuggestion();
              }}
            >
              {pending ? "Saving…" : "Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {recordSheet}
    </div>
  );
}

function RecordPaymentSheet({
  open,
  onOpenChange,
  groupId,
  members,
  currency,
  currentMemberId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: MemberOption[];
  currency: string;
  currentMemberId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg">
        <SheetHeader>
          <SheetTitle>Record a payment</SheetTitle>
          <SheetDescription>
            Log money that already changed hands. This is not a bank transfer.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          <RecordPaymentForm
            groupId={groupId}
            members={members}
            currency={currency}
            currentMemberId={currentMemberId}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
