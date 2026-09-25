import Link from "next/link";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { listAdminUsers, type AdminUserStatus } from "@/lib/site-admin";
import { groupedListClass } from "@/lib/utils";

function pageHref(params: { q: string; status: string; page: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireSiteAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const status: AdminUserStatus | undefined =
    params.status === "pending" || params.status === "active"
      ? params.status
      : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const { page, hasNext, users } = await listAdminUsers(db, {
    query: q,
    status,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <AppShell title="Users" backHref="/admin">
      <form method="get" className="mb-4 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Name, email, or username"
          className="flex-1"
        />
        <NativeSelect
          name="status"
          defaultValue={status ?? ""}
          className="w-28 shrink-0"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching users.</p>
      ) : (
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {users.map((user) => {
              const name = displayNameForUser(user);
              const isPending = user.onboardingCompletedAt == null;
              return (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${encodeURIComponent(user.id)}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                  >
                    <Avatar className="size-9">
                      <AvatarImage src={user.image ?? undefined} alt="" />
                      <AvatarFallback>
                        {name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className="truncate">{name}</span>
                        {isPending ? (
                          <Badge variant="secondary">Pending</Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email ?? "No email"}
                        {user.username ? ` · @${user.username}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p>
                        {user.groupCount} group{user.groupCount === 1 ? "" : "s"}
                      </p>
                      <p>
                        {user.createdAt
                          ? format(user.createdAt, "MMM d, yyyy")
                          : "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {page > 1 || hasNext ? (
        <div className="mt-4 flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref({ q, status: status ?? "", page: page - 1 })}>
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Page {page}</span>
          {hasNext ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref({ q, status: status ?? "", page: page + 1 })}>
                Next
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
