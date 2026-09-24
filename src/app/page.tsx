import Link from "next/link";
import { AddExpenseFab } from "@/components/add-expense-fab";
import { UsersPlusIcon } from "@/components/users-plus-icon";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { InstallCoach } from "@/components/install-coach";
import { SignInProviders } from "@/components/sign-in-providers";
import { Button } from "@/components/ui/button";
import { getOptionalUser } from "@/lib/auth-guards";
import { listViewerGroupSummaries } from "@/lib/balances";
import { formatMoney } from "@/lib/money";
import { cn, groupedListClass } from "@/lib/utils";

export default async function HomePage() {
  const sessionUser = await getOptionalUser();

  if (!sessionUser) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-foreground text-2xl font-bold text-background">
            S
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Splitwiser</h1>
          <p className="text-muted-foreground">
            Create a group, invite friends and family, and split spending
            fairly.
          </p>
        </div>
        <SignInProviders redirectTo="/" />
      </div>
    );
  }

  const withBalances = await listViewerGroupSummaries(sessionUser.id);

  return (
    <>
      <AppShell
        title="Your groups"
        withBottomNav
        className="pb-[calc(10rem+env(safe-area-inset-bottom))]"
        actions={
          <Button asChild variant="ghost" size="icon">
            <Link href="/new" aria-label="Create group">
              <UsersPlusIcon className="size-5" />
            </Link>
          </Button>
        }
      >
        <InstallCoach venue="home" />
        {withBalances.length === 0 ? (
          <EmptyState title="No groups yet">
            Create a group from the header, or open an invite link someone shared
            with you.
          </EmptyState>
        ) : (
          <section aria-labelledby="groups-heading">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="groups-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">All groups</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{withBalances.length}</span>
            </div>
            <ul className={`${groupedListClass} divide-y divide-border/70`}>
              {withBalances.map((g) => (
                <li key={g.groupId}>
                  <Link
                    href={`/g/${g.groupId}`}
                    className="flex min-h-18 items-center justify-between gap-3 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold tracking-tight">
                        {g.groupName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        as {g.displayName}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        g.netCents > 0
                          ? "font-medium text-balance-positive"
                          : g.netCents < 0
                            ? "font-medium text-balance-negative"
                            : "text-muted-foreground",
                      )}
                    >
                      {g.netCents === 0
                        ? "settled"
                        : g.netCents > 0
                          ? `+${formatMoney(g.netCents, g.currency)}`
                          : formatMoney(g.netCents, g.currency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </AppShell>
      <AddExpenseFab
        groups={withBalances.map((g) => ({
          id: g.groupId,
          name: g.groupName,
        }))}
      />
      <AppBottomNav />
    </>
  );
}
