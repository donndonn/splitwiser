"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import {
  AddExpensePill,
  addExpenseFabButtonClass,
  addExpenseFabOffsetClass,
} from "@/components/add-expense-pill";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  resolveAddExpenseEntry,
  type AddExpenseGroup,
} from "@/lib/add-expense-entry";
import { cn } from "@/lib/utils";

function FabSlot({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[41] mx-auto flex w-full max-w-lg justify-end px-4",
        addExpenseFabOffsetClass,
      )}
    >
      {children}
    </div>
  );
}

export function AddExpenseFab({ groups }: { groups: AddExpenseGroup[] }) {
  const entry = resolveAddExpenseEntry(groups);

  if (entry.type === "direct") {
    return (
      <FabSlot>
        <AddExpensePill href={`/g/${entry.groupId}/expenses/new`} />
      </FabSlot>
    );
  }

  const empty = entry.type === "empty";

  return (
    <FabSlot>
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" size="lg" className={addExpenseFabButtonClass}>
            <Receipt />
            Add expense
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className={cn(
            "mx-auto max-h-[min(32rem,85vh)] max-w-lg rounded-t-3xl border-border/70",
            "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          )}
        >
          {empty ? (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle>Create a group first</SheetTitle>
                <SheetDescription>
                  Expenses belong to a group. Create one, then add spending.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-2">
                <Button asChild size="lg" className="w-full">
                  <Link href="/new">Create group</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle>Which group?</SheetTitle>
                <SheetDescription>
                  The expense is added to the group you pick.
                </SheetDescription>
              </SheetHeader>
              <ul className="max-h-[min(24rem,50vh)] divide-y divide-border overflow-y-auto">
                {groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      href={`/g/${group.id}/expenses/new`}
                      className="flex min-h-14 items-center px-4 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      {group.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </FabSlot>
  );
}
