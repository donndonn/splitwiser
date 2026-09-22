"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ExpenseReceiptBreakdown } from "@/lib/expense-receipt-breakdown";
import { cn } from "@/lib/utils";

export function ExpenseSplitDetails({
  breakdown,
}: {
  breakdown: ExpenseReceiptBreakdown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 ml-14">
      <button
        type="button"
        className="flex w-full max-w-md items-start justify-between gap-2 rounded-md text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          {breakdown.caption}
          <span className="ml-1.5 text-muted-foreground/80">
            {open ? "Hide details" : "Show details"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-3 max-w-md rounded-xl border border-border/80 bg-muted/35 px-3.5 py-3 text-sm">
          {breakdown.kind === "itemized" ? (
            <ItemizedReceipt breakdown={breakdown} />
          ) : (
            <SimpleReceipt breakdown={breakdown} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function ItemizedReceipt({
  breakdown,
}: {
  breakdown: Extract<ExpenseReceiptBreakdown, { kind: "itemized" }>;
}) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {breakdown.lines.map((line, index) => (
          <li key={`${line.description}-${index}`} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 font-medium break-words text-foreground">
                {line.description}
                {line.quantity > 1 ? (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                    ×{line.quantity}
                  </span>
                ) : null}
              </p>
              <p className="shrink-0 tabular-nums text-foreground">
                {line.lineTotalLabel}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {line.quantity > 1
                ? `${line.unitAmountLabel} each · `
                : null}
              {line.sharedByNames.length > 0
                ? line.sharedByNames.join(", ")
                : "Unassigned"}
            </p>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-border/70 pt-2.5 text-xs">
        <ReceiptRow label="Items" value={breakdown.itemSubtotalLabel} />
        {breakdown.adjustments.map((adjustment) => (
          <div key={adjustment.label} className="space-y-0.5">
            <ReceiptRow label={adjustment.label} value={adjustment.amountLabel} />
            <p className="pl-0.5 text-[11px] text-muted-foreground">
              {adjustment.note}
            </p>
          </div>
        ))}
        <ReceiptRow label="Total" value={breakdown.totalLabel} emphasize />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {breakdown.allocationNote}
      </p>

      {breakdown.personRollups.length > 0 ? (
        <div className="space-y-1.5 border-t border-border/70 pt-2.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Per person
          </p>
          <ul className="space-y-1">
            {breakdown.personRollups.map((person) => (
              <li
                key={person.memberId}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 break-words text-foreground/90">
                  {person.displayName}
                  <span className="text-muted-foreground">
                    {" "}
                    · items {person.itemsLabel}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {person.totalLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SimpleReceipt({
  breakdown,
}: {
  breakdown: Extract<ExpenseReceiptBreakdown, { kind: "simple" }>;
}) {
  return (
    <div className="space-y-3">
      <ReceiptRow label="Total" value={breakdown.totalLabel} emphasize />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {breakdown.explanation}
      </p>
      <ul className="space-y-1 border-t border-border/70 pt-2.5">
        {breakdown.shares.map((share) => (
          <li
            key={share.memberId}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="min-w-0 break-words text-foreground/90">
              {share.displayName}
              {share.detail ? (
                <span className="text-muted-foreground"> · {share.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {share.amountLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        emphasize ? "pt-1 text-sm font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}
