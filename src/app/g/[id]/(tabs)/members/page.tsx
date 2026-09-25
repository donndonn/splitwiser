import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { invites, members, users } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { listFriends, listFriendStatuses } from "@/lib/friends";
import { inviteStatus } from "@/lib/invites";
import { cn, groupedListClass } from "@/lib/utils";
import { AddFriendsToGroup } from "./add-friends-to-group";
import { addPlaceholderAction } from "./actions";
import { InvitePanel, type InvitePanelInvite } from "./invite-panel";
import { MemberRow } from "./member-row";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, member: me } = await requireMember(id);

  const [roster, latestInvites, friends] = await Promise.all([
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        userId: members.userId,
        isAdmin: members.isAdmin,
        createdAt: members.createdAt,
        username: users.username,
        image: users.image,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
    // The newest link is the current one; after disabling, it shows as
    // disabled so admins can create a new link.
    me.isAdmin
      ? db
          .select()
          .from(invites)
          .where(eq(invites.groupId, id))
          .orderBy(desc(invites.createdAt))
          .limit(1)
      : Promise.resolve([]),
    me.isAdmin ? listFriends(user.id) : Promise.resolve([]),
  ]);

  const friendStatuses = await listFriendStatuses(
    user.id,
    roster.flatMap((member) => (member.userId ? [member.userId] : [])),
  );

  const linkedUserIds = new Set(
    roster.map((m) => m.userId).filter((uid): uid is string => uid != null),
  );
  const friendsToAdd = friends.filter((f) => !linkedUserIds.has(f.id));

  const latest = latestInvites[0];
  const currentInvite: InvitePanelInvite | null = latest
    ? {
        token: latest.token,
        status: inviteStatus(latest),
        expiresAt: latest.expiresAt?.toISOString() ?? null,
        uses: latest.uses,
        maxUses: latest.maxUses,
      }
    : null;

  return (
    <AppShell title="Members" backHref={`/g/${id}`}>
      <div className={cn(groupedListClass, "mb-6")}>
        <ul className="divide-y divide-border">
          {roster.map((m) => (
            <MemberRow
              key={m.id}
              groupId={id}
              member={{
                id: m.id,
                displayName: m.displayName,
                isAdmin: m.isAdmin,
                isPlaceholder: m.userId == null,
                userId: m.userId,
                username: m.username,
                image: m.image,
                friendStatus: m.userId
                  ? (friendStatuses.get(m.userId) ?? "none")
                  : null,
              }}
              isSelf={m.id === me.id}
              canRename={me.isAdmin || me.id === m.id}
              canRemove={me.isAdmin && me.id !== m.id}
            />
          ))}
        </ul>
      </div>

      {me.isAdmin ? (
        <div className="space-y-6">
          <AddFriendsToGroup groupId={id} friends={friendsToAdd} />

          <div className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-medium">Add people by name</h3>
            <p className="text-xs text-muted-foreground">
              Add everyone you expect on the trip, then share an invite so they
              can pick their name when they join.
            </p>
            <form
              action={addPlaceholderAction.bind(null, id)}
              className="flex gap-2"
            >
              <Input name="displayName" placeholder="Name" required />
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
          </div>

          <InvitePanel groupId={id} invite={currentInvite} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only admins can invite people or add placeholders.
        </p>
      )}
    </AppShell>
  );
}
