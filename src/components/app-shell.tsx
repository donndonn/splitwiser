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
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : (
            <div className="size-9" />
          )}
          <h1 className="flex-1 truncate text-center text-base font-semibold">
            {title}
          </h1>
          <div className="flex min-w-9 items-center justify-end gap-1">
            {actions}
          </div>
        </header>
      )}
      <main
        className={cn(
          "flex-1 px-4 py-4",
          withBottomNav && "pb-24",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
