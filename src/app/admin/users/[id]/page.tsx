import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { getAdminUser } from "@/lib/site-admin";
import { groupedListClass } from "@/lib/utils";

function formatDate(date: Date | null) {
  return date ? format(date, "MMM d, yyyy h:mm a") : "—";
}

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSiteAdmin();
  const { id } = await params;
  const detail = await getAdminUser(db, id);
  if (!detail) notFound();
  const { user, memberships, signupInvite } = detail;
  const name = displayNameForUser(user);

  const facts: { label: string; value: string }[] = [
    { label: "Status", value: user.onboardingCompletedAt ? "Active" : "Pending" },
    { label: "Signed up", value: formatDate(user.createdAt) },
    { label: "Joined first group", value: formatDate(user.onboardingCompletedAt) },
    {
      label: "Invited through",
      value: signupInvite?.groupName ?? (user.signupInviteId ? "Deleted group" : "—"),
    },
    { label: "Venmo", value: user.venmoUsername ? `@${user.venmoUsername}` : "—" },
    { label: "User ID", value: user.id },
  ];

  return (
    <AppShell title={name} backHref="/admin/users">
      <div className="mb-6 flex items-center gap-3">
        <Avatar className="size-14">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {user.username ? (
            <p className="truncate text-sm text-muted-foreground">
              @{user.username}
            </p>
          ) : null}
          <p className="truncate text-sm text-muted-foreground">
            {user.email ?? "No email"}
          </p>
        </div>
      </div>

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

      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Groups ({memberships.length})
        </h3>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not in any group.</p>
        ) : (
          <div className={groupedListClass}>
            <ul className="divide-y divide-border">
              {memberships.map((m) => (
                <li
                  key={m.groupId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.groupName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      as {m.displayName} · since{" "}
                      {format(m.joinedAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  {m.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </AppShell>
  );
}
