import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { invites, members, type Invite } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";
import { addPlaceholderAction, revokeInviteAction } from "./actions";
import { CreateInviteForm } from "./create-invite-form";
import { MemberRow } from "./member-row";

const groupCardClass =
  "overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member: me } = await requireMember(id);

  const [roster, activeInvites] = await Promise.all([
    db
      .select()
      .from(members)
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
    me.isAdmin
      ? db
          .select()
          .from(invites)
          .where(eq(invites.groupId, id))
          .orderBy(desc(invites.createdAt))
      : Promise.resolve([] as Invite[]),
  ]);

  const inviteRows = activeInvites.map((inv) => ({
    ...inv,
    inactive:
      inv.revokedAt != null ||
      // Expiry is displayed to admins; treat past expiresAt as inactive.
      // eslint-disable-next-line react-hooks/purity -- server request clock
      (inv.expiresAt != null && inv.expiresAt.getTime() < Date.now()) ||
      (inv.maxUses != null && inv.uses >= inv.maxUses),
  }));

  return (
    <AppShell title="Members" backHref={`/g/${id}`} withBottomNav>
      <div className={cn(groupCardClass, "mb-6")}>
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

          <CreateInviteForm groupId={id} />

          {inviteRows.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Invite links</h3>
              <ul className="space-y-2">
                {inviteRows.map((inv) => (
                  <li
                    key={inv.id}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <p className="break-all font-mono text-xs">
                      /join/{inv.token}
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
                        action={revokeInviteAction.bind(null, id, inv.id)}
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
      ) : (
        <p className="text-sm text-muted-foreground">
          Only admins can invite people or add placeholders.
        </p>
      )}
    </AppShell>
  );
}
