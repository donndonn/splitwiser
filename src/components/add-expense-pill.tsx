"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Offset from the bottom of the viewport (Your groups, fixed) or the group
 * shell (group Home, absolute). `--add-expense-fab-bottom` is tab bar +
 * border + gap + safe area.
 */
export const addExpenseFabOffsetClass = "bottom-[var(--add-expense-fab-bottom)]";

export const addExpenseFabButtonClass =
  "pointer-events-auto h-12 rounded-full px-5 shadow-lg shadow-primary/25";

const addExpenseFabColumnClass =
  "pointer-events-none mx-auto flex w-full max-w-lg justify-end px-[var(--add-expense-fab-right)]";

/**
 * Padding inside the Home scroll pane so the last expense can scroll clear
 * of the floating pill. 3rem matches the pill's h-12. Not a reserved row.
 */
export const groupHomeScrollClearanceClass =
  "pb-[calc(3rem+var(--add-expense-fab-gap))]";

/**
 * Shared pill pocket.
 * `fixed` anchors to the viewport for the root tab bar (that bar is
 * position:fixed). Group Home is absolute against the group shell. That
 * shell is not a flex container: absolute bottom on a flex item lands at
 * the top. The tab bar stays an in-flow footer either way.
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
        "inset-x-0 z-[41]",
        addExpenseFabOffsetClass,
        fixed ? "fixed" : "absolute",
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

/** Group Home only. Floats over the scroll pane, same pocket as the root FAB. */
export function GroupHomeExpenseFab({ groupId }: { groupId: string }) {
  return (
    <AddExpenseFabSlot>
      <AddExpensePill href={`/g/${groupId}/expenses/new`} />
    </AddExpenseFabSlot>
  );
}
