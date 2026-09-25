import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import type { AdminAction } from "@/db/schema";
import { requireSiteAdmin } from "@/lib/auth-guards";
import {
  STALE_PENDING_DAYS,
  getAdminOverview,
  listAdminActions,
} from "@/lib/site-admin";
import { cn, groupedListClass } from "@/lib/utils";
import { MaxUsersForm, StalePendingPanel } from "./admin-controls";

function describeAction(action: AdminAction): string {
  const d = action.details;
  switch (action.action) {
    case "set_max_users":
      return `Cap ${d.fromMaxUsers ?? "unset"} → ${d.toMaxUsers}`;
    case "delete_stale_pending_users": {
      const n = d.deletedUserIds?.length ?? 0;
      return `Deleted ${n} stale signup${n === 1 ? "" : "s"}`;
    }
    case "revoke_invite":
      return `Revoked invite link for ${d.groupName ?? "a deleted group"}`;
    default:
      return action.action;
  }
}

export default async function AdminPage() {
  await requireSiteAdmin();
  const [overview, actions] = await Promise.all([
    getAdminOverview(db),
    listAdminActions(db),
  ]);
  const { total, pending, stalePending, maxUsers } = overview;
  const signupState =
    maxUsers == null || maxUsers === 0
      ? "Signups paused"
      : total >= maxUsers
        ? "Full"
        : `${maxUsers - total} slots open`;

  return (
    <AppShell title="Site admin">
      <div className="mb-6 space-y-1">
        <p className="text-3xl font-semibold tabular-nums tracking-tight">
          {total}
          <span className="text-muted-foreground"> / {maxUsers ?? "—"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          accounts · {pending} pending · {signupState}
        </p>
      </div>

      <div className={cn(groupedListClass, "mb-6")}>
        <ul className="divide-y divide-border">
          {[
            { href: "/admin/users", label: "Users" },
            { href: "/admin/invites", label: "Invite links" },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-12 items-center justify-between px-4 text-sm font-medium hover:bg-muted/50"
              >
                {item.label}
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        <MaxUsersForm maxUsers={maxUsers} total={total} />
        <StalePendingPanel
          stalePending={stalePending}
          pending={pending}
          days={STALE_PENDING_DAYS}
        />

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Recent admin actions</h3>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <div className={groupedListClass}>
              <ul className="divide-y divide-border">
                {actions.map((action) => (
                  <li key={action.id} className="px-4 py-2.5">
                    <p className="text-sm">{describeAction(action)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(action.createdAt, "MMM d, yyyy h:mm a")} ·{" "}
                      {action.actorEmail}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
