import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GroupBottomNav } from "@/components/group-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { expenses, groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { getMemberNet } from "@/lib/balances";
import { formatMoney } from "@/lib/money";

export default async function GroupDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMember(id);

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);

  if (!group) {
    return null;
  }

  const net = await getMemberNet(id, member.id);

  const recent = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amountCents: expenses.amountCents,
      spentAt: expenses.spentAt,
      paidByName: members.displayName,
    })
    .from(expenses)
    .innerJoin(members, eq(expenses.paidByMemberId, members.id))
    .where(eq(expenses.groupId, id))
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(20);

  return (
    <>
      <AppShell
        title={group.name}
        backHref="/"
        withBottomNav
        actions={
          <Button asChild variant="ghost" size="icon">
            <Link href={`/g/${id}/settings`} aria-label="Settings">
              <Settings className="size-5" />
            </Link>
          </Button>
        }
      >
        <Card className="mb-4">
          <CardHeader>
            <CardDescription>Your balance</CardDescription>
            <CardTitle
              className={
                net > 0
                  ? "text-2xl text-emerald-600"
                  : net < 0
                    ? "text-2xl text-rose-600"
                    : "text-2xl"
              }
            >
              {net === 0
                ? "All settled up"
                : net > 0
                  ? `You're owed ${formatMoney(net, group.currency)}`
                  : `You owe ${formatMoney(-net, group.currency)}`}
            </CardTitle>
          </CardHeader>
        </Card>

        <Button asChild size="lg" className="mb-6 w-full">
          <Link href={`/g/${id}/expenses/new`}>
            <Plus className="size-4" />
            Add expense
          </Link>
        </Button>

        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Recent expenses
        </h2>
        {recent.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No expenses yet</CardTitle>
              <CardDescription>
                Add the first one to start splitting.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recent.map((e) => (
              <li key={e.id}>
                <Link href={`/g/${id}/expenses/${e.id}`}>
                  <Card className="transition-colors hover:bg-muted/40">
                    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-medium">
                          {e.description}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {e.paidByName} ·{" "}
                          {e.spentAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </CardDescription>
                      </div>
                      <p className="shrink-0 text-sm font-medium">
                        {formatMoney(e.amountCents, group.currency)}
                      </p>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AppShell>
      <GroupBottomNav groupId={id} />
    </>
  );
}
