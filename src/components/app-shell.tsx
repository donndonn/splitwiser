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
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
      {(title || backHref || actions) && (
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : (
            <div className="size-9" />
          )}
          <h1 className="flex-1 truncate text-center text-base font-semibold tracking-tight">
            {title}
          </h1>
          <div className="flex min-w-9 items-center justify-end gap-1">
            {actions}
          </div>
        </header>
      )}
      <main
        className={cn(
          "flex-1 px-4 py-5",
          withBottomNav && "pb-24",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
