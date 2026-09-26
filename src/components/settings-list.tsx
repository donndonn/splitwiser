import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled group of settings rows in one card, iOS-settings style. */
export function SettingsSection({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-6", className)} aria-labelledby={id}>
      <div className="mb-1.5 flex h-8 items-center justify-between px-1">
        <h2
          id={id}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {title}
        </h2>
        {action}
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {children}
      </div>
    </section>
  );
}

/** Label on the left, value (or control) on the right, one line. */
export const settingsRowClass =
  "flex min-h-12 items-center gap-3 px-4 text-sm";

export const settingsLabelClass = "shrink-0 text-muted-foreground";

/** Same size as the inputs (16px on phones, so iOS doesn't zoom on focus). */
export const settingsValueClass =
  "ml-auto min-w-0 truncate text-right text-base font-medium md:text-sm";

/** Editable rows keep their one-line layout; the row tints while focused. */
export const settingsEditRowClass = "transition-colors focus-within:bg-muted/50";

/** Borderless, right-aligned input that sits where the value was. */
export const settingsInputClass =
  "h-11 min-w-0 bg-transparent text-right text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/70 md:text-sm";
