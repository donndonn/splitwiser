import { desc, eq } from "drizzle-orm";
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
import { friendInvites, type FriendInvite } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { listFriends } from "@/lib/friends";
import {
  removeFriendAction,
  revokeFriendInviteAction,
} from "./actions";
import { CreateFriendInviteForm } from "./create-friend-invite-form";

export default async function FriendsPage() {
  const user = await requireUser("/friends");
  const [friends, invites] = await Promise.all([
    listFriends(user.id),
    db
      .select()
      .from(friendInvites)
      .where(eq(friendInvites.createdByUserId, user.id))
      .orderBy(desc(friendInvites.createdAt)),
  ]);

  const inviteRows = invites.map((inv: FriendInvite) => ({
    ...inv,
    inactive:
      inv.revokedAt != null ||
      (inv.expiresAt != null && inv.expiresAt.getTime() < Date.now()) ||
      (inv.maxUses != null && inv.uses >= inv.maxUses),
  }));

  return (
    <AppShell title="Friends" backHref="/">
      <div className="space-y-6">
        {friends.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No friends yet</CardTitle>
              <CardDescription>
                Create a link below and share it so people can add you.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
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
                    {friend.email}
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
        )}

        <CreateFriendInviteForm />

        {inviteRows.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Your invite links</h3>
            <ul className="space-y-2">
              {inviteRows.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <p className="break-all font-mono text-xs">
                    /friends/join/{inv.token}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uses {inv.uses}
                    {inv.maxUses != null ? ` / ${inv.maxUses}` : ""}
                    {inv.expiresAt
                      ? ` · expires ${inv.expiresAt.toLocaleDateString()}`
                      : " · no expiry"}
                    {inv.inactive ? " · inactive" : ""}
                  </p>
                  {!inv.revokedAt && (
                    <form
                      action={revokeFriendInviteAction.bind(null, inv.id)}
                      className="mt-2"
                    >
                      <Button type="submit" size="sm" variant="ghost">
                        Revoke
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
