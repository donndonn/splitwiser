import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  title,
  backHref,
  actions,
  className,
  withBottomNav = false,
  lockViewport = false,
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  actions?: React.ReactNode;
  className?: string;
  withBottomNav?: boolean;
  /** Column locked to the dynamic viewport. The page does not scroll; main does. */
  lockViewport?: boolean;
}) {
  return (
    <div
      data-viewport-column={lockViewport ? "" : undefined}
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-lg flex-col",
        lockViewport ? "h-dvh max-h-dvh overflow-hidden" : "min-h-full",
      )}
    >
      {(title || backHref || actions) && (
        <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : (
            <div className="size-11 shrink-0" />
          )}
          <h1 className="flex-1 truncate text-center text-base font-semibold tracking-tight">
            {title}
          </h1>
          <div className="flex min-w-11 shrink-0 items-center justify-end gap-1">
            {actions}
          </div>
        </header>
      )}
      <main
        className={cn(
          "min-w-0 flex-1",
          lockViewport
            ? "flex min-h-0 flex-col overflow-hidden"
            : cn("px-4 py-5", withBottomNav && "pb-24"),
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
