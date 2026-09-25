import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import type { InviteStatus } from "@/lib/invites";
import { listCurrentInvites } from "@/lib/site-admin";
import { groupedListClass } from "@/lib/utils";
import { RevokeInviteButton } from "../admin-controls";

const STATUS_LABEL: Record<Exclude<InviteStatus, "live">, string> = {
  expired: "Expired",
  used_up: "Used up",
  revoked: "Revoked",
};

export default async function AdminInvitesPage() {
  await requireSiteAdmin();
  const invites = await listCurrentInvites(db);

  return (
    <AppShell title="Invite links" backHref="/admin">
      <p className="mb-4 text-sm text-muted-foreground">
        Each group’s current link. Revoking stops new joins; group admins can
        create a new link from Members.
      </p>
      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active links.</p>
      ) : (
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    <span className="truncate">{invite.groupName}</span>
                    {invite.status !== "live" ? (
                      <Badge variant="secondary">
                        {STATUS_LABEL[invite.status]}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.uses} of {invite.maxUses ?? "∞"} joins
                    {invite.reserved > 0 ? ` · ${invite.reserved} pending` : ""}
                    {invite.expiresAt
                      ? ` · expires ${format(invite.expiresAt, "MMM d")}`
                      : ""}
                  </p>
                </div>
                <RevokeInviteButton
                  inviteId={invite.id}
                  groupName={invite.groupName}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
