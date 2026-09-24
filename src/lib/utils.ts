import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared chrome for compact lists, with rules instead of a card boundary. */
export const groupedListClass =
  "overflow-hidden border-y border-border/70"
