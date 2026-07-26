import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { GroupBottomNav } from "@/components/group-bottom-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { invites, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  addPlaceholderAction,
  removeMemberAction,
  renameMemberAction,
  revokeInviteAction,
} from "./actions";
import { CreateInviteForm } from "./create-invite-form";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member: me } = await requireMember(id);

  const roster = await db
    .select()
    .from(members)
    .where(eq(members.groupId, id))
    .orderBy(members.createdAt);

  const activeInvites = me.isAdmin
    ? await db
        .select()
        .from(invites)
        .where(eq(invites.groupId, id))
        .orderBy(desc(invites.createdAt))
    : [];

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
    <>
      <AppShell title="Members" backHref={`/g/${id}`} withBottomNav>
        <ul className="mb-6 space-y-2">
          {roster.map((m) => (
            <li key={m.id} className="rounded-xl border px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {m.displayName}
                    {m.id === me.id ? " (you)" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.isAdmin && <Badge variant="secondary">Admin</Badge>}
                    {m.userId == null ? (
                      <Badge variant="outline">Placeholder</Badge>
                    ) : (
                      <Badge variant="outline">Signed in</Badge>
                    )}
                  </div>
                </div>
              </div>

              {(me.isAdmin || me.id === m.id) && (
                <form
                  action={renameMemberAction.bind(null, id, m.id)}
                  className="mt-3 flex gap-2"
                >
                  <Input
                    name="displayName"
                    defaultValue={m.displayName}
                    className="h-8"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Rename
                  </Button>
                </form>
              )}

              {me.isAdmin && me.id !== m.id && (
                <form
                  action={removeMemberAction.bind(null, id, m.id)}
                  className="mt-2"
                >
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                  >
                    Remove
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {me.isAdmin ? (
          <div className="space-y-6">
            <div className="space-y-3 rounded-xl border p-4">
              <h3 className="text-sm font-medium">Add placeholder</h3>
              <p className="text-xs text-muted-foreground">
                For people who will not sign in. They can claim later via an
                invite.
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
      <GroupBottomNav groupId={id} />
    </>
  );
}
