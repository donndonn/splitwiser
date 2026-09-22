"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Above a 4rem tab bar plus the home-indicator inset, with room for the shadow. */
export const addExpenseFabOffsetClass =
  "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]";

export const addExpenseFabButtonClass =
  "pointer-events-auto h-12 rounded-full px-5 shadow-lg shadow-primary/25";

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

/**
 * Group Home only. An in-flow row in the tab shell, above the tab bar.
 * Not position:fixed or absolute: a fixed layer is what made the iOS tab
 * bar stick, and absolute bottom inside this flex column lands at the top.
 */
export function GroupHomeExpenseFab({ groupId }: { groupId: string }) {
  return (
    <div className="pointer-events-none mx-auto flex w-full max-w-lg shrink-0 justify-end px-4 pt-1 pb-3">
      <AddExpensePill href={`/g/${groupId}/expenses/new`} />
    </div>
  );
}
