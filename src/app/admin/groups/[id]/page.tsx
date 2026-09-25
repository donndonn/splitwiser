import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import { formatMoney } from "@/lib/money";
import { getAdminGroup } from "@/lib/site-admin";
import { groupedListClass } from "@/lib/utils";
import { RevokeInviteButton } from "../../admin-controls";

function formatDate(date: Date | null) {
  return date ? format(date, "MMM d, yyyy") : "—";
}

const INVITE_STATUS: Record<string, string> = {
  live: "Live",
  expired: "Expired",
  used_up: "Used up",
  revoked: "Revoked",
};

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSiteAdmin();
  const { id } = await params;
  const detail = await getAdminGroup(db, id);
  if (!detail) notFound();
  const { group, members, invite } = detail;

  const facts: { label: string; value: string }[] = [
    { label: "Created", value: formatDate(group.createdAt) },
    {
      label: "Expenses",
      value: `${detail.expenseCount} · ${formatMoney(detail.totalCents, group.currency)}`,
    },
    { label: "Last expense", value: formatDate(detail.lastSpentAt) },
    { label: "Last activity", value: formatDate(detail.lastActivityAt) },
    {
      label: "Invite link",
      value: invite
        ? `${INVITE_STATUS[invite.status]} · ${invite.uses} of ${invite.maxUses ?? "∞"} joins${invite.reserved > 0 ? ` · ${invite.reserved} pending` : ""}`
        : "None",
    },
    { label: "Group ID", value: group.id },
  ];

  return (
    <AppShell title={group.name} backHref="/admin/groups">
      <div className={`${groupedListClass} mb-6`}>
        <dl className="divide-y divide-border">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
            >
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 truncate text-right">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {invite ? (
        <div className="-mt-4 mb-6 flex justify-end">
          <RevokeInviteButton inviteId={invite.id} groupName={group.name} />
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Members ({members.length})</h3>
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const body = (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.userId
                        ? (m.email ?? "No email")
                        : "Placeholder, no account"}
                      {" · since "}
                      {format(m.joinedAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  {m.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
                </>
              );
              return (
                <li key={m.id}>
                  {m.userId ? (
                    <Link
                      href={`/admin/users/${encodeURIComponent(m.userId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
