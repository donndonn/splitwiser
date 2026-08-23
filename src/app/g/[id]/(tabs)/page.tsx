import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RecentExpensesList } from "@/components/recent-expenses-list";
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

  const [[group], net, recent] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    getMemberNet(id, member.id),
    db
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
      .limit(20),
  ]);

  if (!group) {
    return null;
  }

  return (
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
                ? "text-2xl text-balance-positive"
                : net < 0
                  ? "text-2xl text-balance-negative"
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
      <RecentExpensesList
        groupId={id}
        currency={group.currency}
        expenses={recent.map((e) => ({
          id: e.id,
          description: e.description,
          amountCents: e.amountCents,
          paidByName: e.paidByName,
          spentAtLabel: e.spentAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        }))}
      />
    </AppShell>
  );
}
