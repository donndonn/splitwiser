"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Fixed offset for the root groups FAB. The length is
 * `--add-expense-fab-bottom` in globals.css (tab bar + border + gap +
 * safe area), the same gap and right inset the in-flow group Home pill uses.
 */
export const addExpenseFabOffsetClass = "bottom-[var(--add-expense-fab-bottom)]";

export const addExpenseFabButtonClass =
  "pointer-events-auto h-12 rounded-full px-5 shadow-lg shadow-primary/25";

const addExpenseFabColumnClass =
  "pointer-events-none mx-auto flex w-full max-w-lg justify-end px-[var(--add-expense-fab-right)]";

/**
 * Shared pill pocket.
 * `fixed` anchors to the viewport for the root tab bar (that bar is
 * position:fixed). Group Home passes `fixed={false}` so the row stays in
 * the tab column: a fixed layer is what made the iOS tab bar stick, and
 * absolute bottom inside that flex column lands at the top.
 */
export function AddExpenseFabSlot({
  fixed = false,
  children,
}: {
  fixed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        addExpenseFabColumnClass,
        fixed
          ? cn("fixed inset-x-0 z-[41]", addExpenseFabOffsetClass)
          : "shrink-0 pt-1 pb-[var(--add-expense-fab-gap)]",
      )}
    >
      {children}
    </div>
  );
}

export function AddExpensePill({ href }: { href: string }) {
  return (
    <Button asChild size="lg" className={addExpenseFabButtonClass}>
      <Link href={href}>
        <Receipt />
        Add expense
      </Link>
    </Button>
  );
}

/** Group Home only. In-flow row above the group tab bar, same pocket as the root FAB. */
export function GroupHomeExpenseFab({ groupId }: { groupId: string }) {
  return (
    <AddExpenseFabSlot>
      <AddExpensePill href={`/g/${groupId}/expenses/new`} />
    </AddExpenseFabSlot>
  );
}
