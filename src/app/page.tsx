import Link from "next/link";
import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export default async function HomePage() {
  const user = await getOptionalUser();

  if (!user) {
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
    .where(eq(members.userId, user.id));

  const withBalances = await Promise.all(
    memberships.map(async (m) => {
      const balances = await getGroupBalances(m.groupId);
      const net =
        balances.find((b) => b.memberId === m.memberId)?.netCents ?? 0;
      return { ...m, net };
    }),
  );

  return (
    <AppShell
      title="Your groups"
      actions={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3">
        <Avatar>
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>
            {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name ?? "You"}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Button asChild size="lg" className="flex-1">
          <Link href="/new">
            <Plus className="size-4" />
            Create group
          </Link>
        </Button>
      </div>

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
        <ul className="space-y-2">
          {withBalances.map((g) => (
            <li key={g.groupId}>
              <Link href={`/g/${g.groupId}`}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-4">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {g.groupName}
                      </CardTitle>
                      <CardDescription>as {g.displayName}</CardDescription>
                    </div>
                    <p
                      className={
                        g.net > 0
                          ? "shrink-0 text-sm font-medium text-emerald-600"
                          : g.net < 0
                            ? "shrink-0 text-sm font-medium text-rose-600"
                            : "shrink-0 text-sm text-muted-foreground"
                      }
                    >
                      {g.net === 0
                        ? "settled"
                        : g.net > 0
                          ? `+${formatMoney(g.net, g.currency)}`
                          : formatMoney(g.net, g.currency)}
                    </p>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
