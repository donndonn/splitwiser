"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn, groupedListClass } from "@/lib/utils";

/** Collapsed receipt row. Same chevron / aria-expanded pattern as Show details. */
export function ReceiptPhotoDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(groupedListClass, "min-w-0")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Receipt photo</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border/70 px-4 pt-3 pb-4">{children}</div>
      ) : null}
    </div>
  );
}
