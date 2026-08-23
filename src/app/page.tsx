import Link from "next/link";
import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import { formatMoney } from "@/lib/money";
import { getGroupBalances } from "@/lib/balances";
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
        <Button asChild size="lg" className="w-full">
          <Link href="/signin">Sign in with Google</Link>
        </Button>
      </div>
    );
  }

  const memberships = await db
    .select({
      groupId: groups.id,
      groupName: groups.name,
      currency: groups.currency,
      memberId: members.id,
      displayName: members.displayName,
    })
    .from(members)
    .innerJoin(groups, eq(members.groupId, groups.id))
    .where(eq(members.userId, sessionUser.id));

  const withBalances = await Promise.all(
    memberships.map(async (m) => {
      const balances = await getGroupBalances(m.groupId);
      const net =
        balances.find((b) => b.memberId === m.memberId)?.netCents ?? 0;
      return { ...m, net };
    }),
  );

  return (
    <>
      <AppShell title="Your groups" withBottomNav>
        <Button asChild size="lg" className="mb-5 w-full">
          <Link href="/new">
            <Plus className="size-4" />
            Create group
          </Link>
        </Button>

        {withBalances.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No groups yet</CardTitle>
              <CardDescription>
                Create a group or open an invite link someone shared with you.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className={groupedListClass}>
            <ul className="divide-y divide-border">
              {withBalances.map((g) => (
                <li key={g.groupId}>
                  <Link
                    href={`/g/${g.groupId}`}
                    className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {g.groupName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        as {g.displayName}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-sm",
                        g.net > 0
                          ? "font-medium text-balance-positive"
                          : g.net < 0
                            ? "font-medium text-balance-negative"
                            : "text-muted-foreground",
                      )}
                    >
                      {g.net === 0
                        ? "settled"
                        : g.net > 0
                          ? `+${formatMoney(g.net, g.currency)}`
                          : formatMoney(g.net, g.currency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AppShell>
      <AppBottomNav />
    </>
  );
}
