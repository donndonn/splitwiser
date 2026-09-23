"use client";

import { Trash2 } from "lucide-react";
import { SwipeableRow } from "@/components/swipeable-row";
import { cn } from "@/lib/utils";

type ExpenseShareDisplay =
  | { kind: "borrowed" | "lent"; amountLabel: string }
  | { kind: "settled" | "none" };

type SwipeableExpenseRowProps = {
  href: string;
  description: string;
  paidLabel: string;
  month: string;
  day: string;
  share: ExpenseShareDisplay;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteRequest: () => void;
};

const shareToneClass = {
  borrowed: "text-balance-negative",
  lent: "text-balance-positive",
} as const;

const shareLabel = {
  borrowed: "You owe",
  lent: "Owes you",
} as const;

export function SwipeableExpenseRow({
  href,
  description,
  paidLabel,
  month,
  day,
  share,
  open,
  onOpenChange,
  onDeleteRequest,
}: SwipeableExpenseRowProps) {
  return (
    <SwipeableRow
      href={href}
      open={open}
      onOpenChange={onOpenChange}
      onAction={onDeleteRequest}
      actionLabel="Delete"
      actionIcon={<Trash2 className="size-4" />}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="flex w-9 shrink-0 flex-col items-center leading-none text-muted-foreground">
          <span className="text-[11px] font-medium">{month}</span>
          <span className="mt-1 text-base font-medium tabular-nums">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{description}</p>
          <p className="truncate text-xs text-muted-foreground">{paidLabel}</p>
        </div>
        {share.kind === "borrowed" || share.kind === "lent" ? (
          <div
            className={cn(
              "shrink-0 text-right leading-tight",
              shareToneClass[share.kind],
            )}
          >
            <p className="text-[11px] font-medium">{shareLabel[share.kind]}</p>
            <p className="text-sm font-semibold tabular-nums">
              {share.amountLabel}
            </p>
          </div>
        ) : share.kind === "settled" ? (
          <p className="shrink-0 text-xs font-medium text-muted-foreground">
            Settled
          </p>
        ) : null}
      </div>
    </SwipeableRow>
  );
}
