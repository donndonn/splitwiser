import { eq } from "drizzle-orm";
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
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
} from "@/lib/friends";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
} from "./actions";
import { FriendSearch } from "./friend-search";

export default async function FriendsPage() {
  const sessionUser = await requireUser("/friends");
  const [[dbUser], friends, incoming, outgoing] = await Promise.all([
    db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1),
    listFriends(sessionUser.id),
    listIncomingRequests(sessionUser.id),
    listOutgoingRequests(sessionUser.id),
  ]);

  const hasUsername = Boolean(dbUser?.username);

  return (
    <AppShell title="Friends" backHref="/">
      <div className="space-y-6">
        <FriendSearch hasUsername={hasUsername} />

        {incoming.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Friend requests</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.07]">
              {incoming.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 px-4 py-3"
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
            <h3 className="text-sm font-medium">Sent requests</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.07]">
              {outgoing.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 px-4 py-3"
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
          <Card>
            <CardHeader>
              <CardTitle>No friends yet</CardTitle>
              <CardDescription>
                Search by email or @username to send a friend request.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Your friends</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex items-center gap-3 px-4 py-3"
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
                  <form action={removeFriendAction.bind(null, friend.id)}>
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
  );
}
