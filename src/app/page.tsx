import Link from "next/link";
import { eq } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
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
import { groups, members, users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { formatMoney } from "@/lib/money";
import { getGroupBalances } from "@/lib/balances";

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

  const [[dbUser], memberships] = await Promise.all([
    db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1),
    db
      .select({
        groupId: groups.id,
        groupName: groups.name,
        currency: groups.currency,
        memberId: members.id,
        displayName: members.displayName,
      })
      .from(members)
      .innerJoin(groups, eq(members.groupId, groups.id))
      .where(eq(members.userId, sessionUser.id)),
  ]);

  const profileName = dbUser
    ? displayNameForUser(dbUser)
    : displayNameForUser(sessionUser);
  const profileImage = dbUser?.image ?? sessionUser.image;
  const profileEmail = dbUser?.email ?? sessionUser.email;

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
      <Link
        href="/profile"
        className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40"
      >
        <Avatar>
          <AvatarImage src={profileImage ?? undefined} alt="" />
          <AvatarFallback>
            {profileName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{profileName}</p>
          {dbUser?.username ? (
            <p className="truncate text-sm text-muted-foreground">
              @{dbUser.username}
            </p>
          ) : null}
          <p className="truncate text-sm text-muted-foreground">
            {profileEmail}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Profile</span>
      </Link>

      <div className="mb-4 flex gap-2">
        <Button asChild size="lg" className="flex-1">
          <Link href="/new">
            <Plus className="size-4" />
            Create group
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="flex-1">
          <Link href="/friends">
            <Users className="size-4" />
            Friends
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
