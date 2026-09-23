"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCents, formatMoney } from "@/lib/money";
import {
  paymentActionLabel,
  rowIdForSuggestion,
  type SettlementSuggestion,
} from "@/lib/settlement-copy";
import { cn, groupedListClass } from "@/lib/utils";
import {
  listVenmoPayLinks,
  openVenmoPay,
  prefersVenmoApp,
  type VenmoPayLink,
} from "@/lib/venmo";
import { recordSettlementAction, settleGroupAction } from "./actions";
import { RecordPaymentForm } from "./record-payment-form";

export type BalanceRow = {
  memberId: string;
  displayName: string;
  netCents: number;
  isYou: boolean;
};

type MemberOption = {
  id: string;
  displayName: string;
  venmoUsername: string | null;
};

export function SettleUpSection({
  groupId,
  groupName,
  currency,
  currentMemberId,
  members,
  rows,
  suggestions,
}: {
  groupId: string;
  groupName: string;
  currency: string;
  currentMemberId: string;
  members: MemberOption[];
  rows: BalanceRow[];
  suggestions: SettlementSuggestion[];
}) {
  const [pending, startTransition] = useTransition();
  const [settleOpen, setSettleOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<SettlementSuggestion | null>(null);

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.displayName])),
    [members],
  );

  const venmoPays = useMemo(
    () =>
      listVenmoPayLinks({
        currency,
        groupName,
        currentMemberId,
        suggestions,
        venmoUsernameByMemberId: new Map(
          members.map((member) => [member.id, member.venmoUsername]),
        ),
      }),
    [currency, groupName, currentMemberId, suggestions, members],
  );

  const suggestionsByRow = useMemo(() => {
    const map = new Map<string, SettlementSuggestion[]>();
    for (const suggestion of suggestions) {
      const rowId = rowIdForSuggestion(suggestion, currentMemberId);
      const list = map.get(rowId) ?? [];
      list.push(suggestion);
      map.set(rowId, list);
    }
    return map;
  }, [suggestions, currentMemberId]);

  function labelFor(suggestion: SettlementSuggestion) {
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

  function onPayVenmoClick(
    event: MouseEvent<HTMLAnchorElement>,
    link: VenmoPayLink,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (!prefersVenmoApp()) return;
    event.preventDefault();
    openVenmoPay(link.appUrl, link.webUrl);
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

  return (
    <div className="mb-6 space-y-4">
      <div className={groupedListClass}>
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const rowSuggestions = suggestionsByRow.get(row.memberId) ?? [];
            return (
              <li
                key={row.memberId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar size="sm">
                    <AvatarFallback>
                      {row.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">
                    {row.displayName}
                    {row.isYou ? " (you)" : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      row.netCents > 0
                        ? "text-balance-positive"
                        : row.netCents < 0
                          ? "text-balance-negative"
                          : "text-muted-foreground",
                    )}
                  >
                    {row.netCents === 0
                      ? "settled"
                      : row.netCents > 0
                        ? `owed ${formatMoney(row.netCents, currency)}`
                        : `owes ${formatMoney(-row.netCents, currency)}`}
                  </span>
                  {rowSuggestions.map((suggestion) => (
                    <Button
                      key={`${suggestion.fromMemberId}-${suggestion.toMemberId}`}
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setPendingSuggestion(suggestion)}
                    >
                      {rowSuggestions.length > 1
                        ? formatMoney(suggestion.amountCents, currency)
                        : "Record"}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {venmoPays.map((link) => (
        <Button
          key={link.toMemberId}
          variant="outline"
          size="lg"
          className="w-full min-w-0 overflow-hidden"
          asChild
        >
          <a
            href={link.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`@${link.username}`}
            onClick={(event) => onPayVenmoClick(event, link)}
          >
            <span className="truncate">
              Pay {nameById.get(link.toMemberId) ?? "them"}{" "}
              {formatMoney(link.amountCents, currency)} on Venmo
            </span>
          </a>
        </Button>
      ))}

      {suggestions.length > 0 ? (
        <>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => setSettleOpen(true)}
          >
            Settle group
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setRecordOpen(true)}
          >
            Record a different payment
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setRecordOpen(true)}
        >
          Record a payment
        </Button>
      )}

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

      <Sheet open={recordOpen} onOpenChange={setRecordOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg">
          <SheetHeader>
            <SheetTitle>Record a payment</SheetTitle>
            <SheetDescription>
              Log money that already changed hands. This is not a bank
              transfer.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            <RecordPaymentForm
              groupId={groupId}
              members={members.map((member) => ({
                id: member.id,
                displayName: member.displayName,
              }))}
              currency={currency}
              currentMemberId={currentMemberId}
              onSuccess={() => setRecordOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
