import Link from "next/link";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import { formatMoney } from "@/lib/money";
import { listAdminGroups } from "@/lib/site-admin";
import { groupedListClass } from "@/lib/utils";

function pageHref(params: { q: string; page: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/groups?${qs}` : "/admin/groups";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireSiteAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const { page, hasNext, groups } = await listAdminGroups(db, {
    query: q,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <AppShell title="Groups" backHref="/admin">
      <form method="get" className="mb-4 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Group name"
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching groups.</p>
      ) : (
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/admin/groups/${encodeURIComponent(group.id)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {plural(group.accounts, "member")}
                      {group.placeholders > 0
                        ? ` + ${group.placeholders} placeholder${group.placeholders === 1 ? "" : "s"}`
                        : ""}
                      {" · "}
                      {plural(group.expenseCount, "expense")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p className="tabular-nums">
                      {formatMoney(group.totalCents, group.currency)}
                    </p>
                    <p>Created {format(group.createdAt, "MMM d, yyyy")}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {page > 1 || hasNext ? (
        <div className="mt-4 flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref({ q, page: page - 1 })}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Page {page}</span>
          {hasNext ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref({ q, page: page + 1 })}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
