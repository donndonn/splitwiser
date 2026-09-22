"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
 * Group Home only. Anchored in the tab shell (not position:fixed) so it
 * stays above the in-flow tab bar without the iOS fixed-layer bug.
 */
export function GroupHomeExpenseFab({ groupId }: { groupId: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 mx-auto flex w-full max-w-lg justify-end px-4",
        addExpenseFabOffsetClass,
      )}
    >
      <AddExpensePill href={`/g/${groupId}/expenses/new`} />
    </div>
  );
}
