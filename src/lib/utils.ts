import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared chrome for compact grouped lists (balances, members, expenses). */
export const groupedListClass =
  "overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]"
