"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
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
  listVenmoRequestLinks,
  openVenmoPay,
  prefersVenmoApp,
} from "@/lib/venmo";
import { recordSettlementAction, settleGroupAction } from "./actions";
import { RecordPaymentForm } from "./record-payment-form";

/** Simple V mark. Not Venmo’s trademarked wordmark. */
function VenmoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6.2 4.2 12 19.2 17.8 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<SettlementSuggestion | null>(null);

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.displayName])),
    [members],
  );

  const venmoDirectory = useMemo(
    () =>
      new Map(members.map((member) => [member.id, member.venmoUsername])),
    [members],
  );

  const venmoPays = useMemo(
    () =>
      listVenmoPayLinks({
        currency,
        groupName,
        currentMemberId,
        suggestions,
        venmoUsernameByMemberId: venmoDirectory,
      }),
    [currency, groupName, currentMemberId, suggestions, venmoDirectory],
  );

  const venmoRequests = useMemo(
    () =>
      listVenmoRequestLinks({
        currency,
        groupName,
        currentMemberId,
        suggestions,
        venmoUsernameByMemberId: venmoDirectory,
      }),
    [currency, groupName, currentMemberId, suggestions, venmoDirectory],
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

  const selectedRow = rows.find((row) => row.memberId === selectedRowId);
  const selectedSuggestions = selectedRowId
    ? (suggestionsByRow.get(selectedRowId) ?? [])
    : [];

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

  function onVenmoClick(
    event: MouseEvent<HTMLAnchorElement>,
    link: { appUrl: string; webUrl: string },
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
            const content = (
              <>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar size="sm">
                    <AvatarFallback>
                      {row.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">
                    {row.displayName}
                    {row.isYou ? " (you)" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-right text-sm font-medium tabular-nums",
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
                  {rowSuggestions.length > 0 && (
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </>
            );
            return (
              <li key={row.memberId}>
                {rowSuggestions.length > 0 ? (
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={`Payment options for ${row.displayName}`}
                    disabled={pending}
                    onClick={() => setSelectedRowId(row.memberId)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

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

      <Sheet
        open={selectedRowId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRowId(null);
        }}
      >
        <SheetContent side="bottom" className="mx-auto max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {selectedRow ? `Payments for ${selectedRow.displayName}` : "Payments"}
            </SheetTitle>
            <SheetDescription>
              Choose a suggested payment. Venmo opens the payment or request;
              record it here after the money moves.
            </SheetDescription>
          </SheetHeader>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto px-4 pb-8">
            {selectedSuggestions.map((suggestion) => {
              const venmoPay =
                suggestion.fromMemberId === currentMemberId
                  ? venmoPays.find(
                      (link) =>
                        link.toMemberId === suggestion.toMemberId &&
                        link.amountCents === suggestion.amountCents,
                    )
                  : undefined;
              const venmoRequest =
                suggestion.toMemberId === currentMemberId
                  ? venmoRequests.find(
                      (link) =>
                        link.fromMemberId === suggestion.fromMemberId &&
                        link.amountCents === suggestion.amountCents,
                    )
                  : undefined;
              const venmoLink = venmoPay ?? venmoRequest;

              return (
                <div
                  key={`${suggestion.fromMemberId}-${suggestion.toMemberId}`}
                  className="space-y-3 rounded-2xl bg-muted/50 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium">
                      {labelFor(suggestion)}
                    </p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(suggestion.amountCents, currency)}
                    </p>
                  </div>
                  {venmoLink && (
                    <Button
                      variant="outline"
                      className="w-full justify-center gap-2 border-transparent bg-[#008CFF] text-white shadow-none hover:bg-[#0074FF] hover:text-white active:bg-[#0074FF] dark:border-transparent dark:bg-[#008CFF] dark:text-white dark:hover:bg-[#0074FF] dark:hover:text-white"
                      asChild
                    >
                      <a
                        href={venmoLink.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`@${venmoLink.username}`}
                        onClick={(event) => onVenmoClick(event, venmoLink)}
                      >
                        <VenmoMark className="size-4" />
                        {venmoPay ? "Pay with Venmo" : "Request on Venmo"}
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pending}
                    onClick={() => {
                      setSelectedRowId(null);
                      setPendingSuggestion(suggestion);
                    }}
                  >
                    Record payment
                  </Button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
