import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import {
  friendBalancePhrase,
  friendNetsForUsers,
  type CurrencyNet,
} from "@/lib/friend-balances";
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/friends";
import { cn } from "@/lib/utils";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
} from "./actions";
import { FriendSearch } from "./friend-search";

export default async function FriendsPage() {
  const sessionUser = await requireUser("/friends");
  const [[dbUser], friends, incoming, outgoing, balanceNets] = await Promise.all([
    db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1),
    listFriends(sessionUser.id),
    listIncomingRequests(sessionUser.id),
    listOutgoingRequests(sessionUser.id),
    friendNetsForUsers(sessionUser.id),
  ]);

  const hasUsername = Boolean(dbUser?.username);

  return (
    <>
      <AppShell
        title="Friends"
        withBottomNav
        actions={<FriendSearch hasUsername={hasUsername} />}
      >
        <div className="space-y-8">

        {incoming.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Friend requests</h3>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {incoming.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 py-3"
                >
                  <Avatar>
                    <AvatarImage src={req.user.image ?? undefined} alt="" />
                    <AvatarFallback>
                      {req.user.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {req.user.displayName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {req.user.username
                        ? `@${req.user.username}`
                        : req.user.email}
                    </p>
                  </div>
                  <form action={acceptFriendRequestAction.bind(null, req.id)}>
                    <Button type="submit" size="sm">
                      Accept
                    </Button>
                  </form>
                  <form action={declineFriendRequestAction.bind(null, req.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Decline
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sent requests</h3>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {outgoing.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 py-3"
                >
                  <Avatar>
                    <AvatarImage src={req.user.image ?? undefined} alt="" />
                    <AvatarFallback>
                      {req.user.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {req.user.displayName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      Pending
                    </p>
                  </div>
                  <form action={cancelFriendRequestAction.bind(null, req.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Cancel
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {friends.length === 0 ? (
          <EmptyState title="No friends yet">
            Search by email or @username to send a friend request.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your friends</h3>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="relative"
                >
                  <Link
                    href={`/friends/${friend.id}`}
                    className="flex min-h-24 items-center gap-3 pb-9 pt-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar>
                      <AvatarImage src={friend.image ?? undefined} alt="" />
                      <AvatarFallback>
                        {friend.displayName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{friend.displayName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {friend.username
                          ? `@${friend.username}`
                          : friend.email}
                      </p>
                    </div>
                    <FriendBalance nets={balanceNets.get(friend.id) ?? []} />
                  </Link>
                  <form
                    action={removeFriendAction.bind(null, friend.id)}
                    className="absolute bottom-2 right-0"
                  >
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </AppShell>
      <AppBottomNav />
    </>
  );
}

function FriendBalance({ nets }: { nets: CurrencyNet[] }) {
  if (nets.length === 0) {
    return <p className="text-sm text-muted-foreground">settled</p>;
  }

  return (
    <div className="text-right">
      {nets.map((net) => (
        <p
          key={net.currency}
          className={cn(
            "text-sm font-medium tabular-nums",
            net.netCents > 0
              ? "text-balance-positive"
              : "text-balance-negative",
          )}
        >
          {friendBalancePhrase(net)}
        </p>
      ))}
    </div>
  );
}
