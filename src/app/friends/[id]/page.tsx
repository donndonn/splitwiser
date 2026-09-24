import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChevronRight, WalletCards } from "lucide-react";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import {
  friendBalancePhrase,
  sharedFriendGroupBalances,
} from "@/lib/friend-balances";
import { areFriends, displayNameForUser } from "@/lib/friends";
import { cn, groupedListClass } from "@/lib/utils";

export default async function FriendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireUser(`/friends/${id}`);
  if (!(await areFriends(viewer.id, id))) notFound();

  const [[friend], sharedGroups] = await Promise.all([
    db
      .select({
        name: users.name,
        username: users.username,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1),
    sharedFriendGroupBalances(viewer.id, id),
  ]);
  if (!friend) notFound();

  const name = displayNameForUser(friend);
  const totals = new Map<string, number>();
  for (const group of sharedGroups) {
    totals.set(
      group.currency,
      (totals.get(group.currency) ?? 0) + group.netCents,
    );
  }
  const balances = [...totals]
    .filter(([, netCents]) => netCents !== 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <AppShell title={name} backHref="/friends" withBottomNav>
        <section className="mb-8 flex items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.07]">
          <Avatar className="size-16 shrink-0 text-xl">
            <AvatarImage src={friend.image ?? undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{name}</h2>
            {friend.username && (
              <p className="truncate text-sm text-muted-foreground">
                @{friend.username}
              </p>
            )}
            <div className="mt-2 space-y-0.5">
              {balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You are settled up.
                </p>
              ) : (
                balances.map(([currency, netCents]) => (
                  <p
                    key={currency}
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      netCents > 0
                        ? "text-balance-positive"
                        : "text-balance-negative",
                    )}
                  >
                    {friendBalancePhrase({ currency, netCents })}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="shared-groups-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="shared-groups-heading" className="text-sm font-semibold">
              Shared groups
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {sharedGroups.length}
            </span>
          </div>
          {sharedGroups.length === 0 ? (
            <p className="rounded-2xl bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-foreground/[0.07]">
              You and {name} aren&apos;t in any groups together yet.
            </p>
          ) : (
            <div className={groupedListClass}>
              <ul className="divide-y divide-border">
                {sharedGroups.map((group) => (
                  <li key={group.groupId}>
                    <Link
                      href={`/g/${group.groupId}/balances`}
                      className="flex min-h-20 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <WalletCards className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {group.groupName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Shared group
                        </span>
                      </span>
                      <span
                        className={cn(
                          "max-w-28 shrink-0 text-right text-xs tabular-nums sm:max-w-36 sm:text-sm",
                          group.netCents > 0
                            ? "font-medium text-balance-positive"
                            : group.netCents < 0
                              ? "font-medium text-balance-negative"
                              : "text-muted-foreground",
                        )}
                      >
                        {group.netCents === 0
                          ? "settled up"
                          : friendBalancePhrase(group)}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </AppShell>
      <AppBottomNav />
    </>
  );
}
