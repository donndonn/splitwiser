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
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  actions?: React.ReactNode;
  className?: string;
  withBottomNav?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full min-w-0 max-w-lg flex-col">
      {(title || backHref || actions) && (
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border/50 bg-background/95 px-5 py-2 backdrop-blur-xl">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : null}
          <h1 className="flex-1 truncate text-left text-lg font-semibold tracking-tight">
            {title}
          </h1>
          <div className="flex min-w-11 shrink-0 items-center justify-end gap-1">
            {actions}
          </div>
        </header>
      )}
      <main
        className={cn(
          "min-w-0 flex-1 px-5 py-6",
          withBottomNav && "pb-24",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
