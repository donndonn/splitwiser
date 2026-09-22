import Link from "next/link";
import { eq } from "drizzle-orm";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MarkAsSettledPrompt } from "@/components/mark-as-settled-prompt";
import {
  RecentExpensesList,
  type RecentExpenseItem,
} from "@/components/recent-expenses-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  formatBalanceContext,
  viewerBalanceContext,
} from "@/lib/balance-context";
import { formatMoney } from "@/lib/money";
import { formatExpenseDateLabel, formatExpenseDateParts } from "@/lib/settle-marker";
import {
  getGroupSettleView,
  type SettleExpenseRow,
} from "@/lib/settle-marker-store";

function toRecentItem(
  row: SettleExpenseRow,
  viewerMemberId: string,
): RecentExpenseItem {
  const date = formatExpenseDateParts(row.spentAt);
  return {
    id: row.id,
    description: row.description,
    amountCents: row.amountCents,
    month: date.month,
    day: date.day,
    paidByName: row.paidByName,
    paidByViewer: row.paidByMemberId === viewerMemberId,
    viewerShareCents: row.viewerShareCents ?? 0,
  };
}

export default async function GroupDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMember(id);

  const [[group], settleView] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    getGroupSettleView(id, member.id),
  ]);

  if (!group) {
    return null;
  }

  const net =
    settleView.balances.find((row) => row.memberId === member.id)?.netCents ??
    0;
  const balanceContext = formatBalanceContext(
    viewerBalanceContext(member.id, settleView.balances),
  );
  const settleMarkerLabel = settleView.archived[0]
    ? formatExpenseDateLabel(settleView.archived[0].spentAt)
    : null;

  return (
    <AppShell
      title={group.name}
      backHref="/"
      className="pb-28"
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
          <p className="text-sm text-muted-foreground">{balanceContext}</p>
        </CardHeader>
      </Card>

      {settleView.showPrompt ? <MarkAsSettledPrompt groupId={id} /> : null}

      {net !== 0 && (
        <div className="mb-6 flex justify-center">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-muted-foreground"
          >
            <Link href={`/g/${id}/balances`}>Settle up</Link>
          </Button>
        </div>
      )}

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Recent expenses
      </h2>
      <RecentExpensesList
        groupId={id}
        currency={group.currency}
        expenses={settleView.recent.map((row) => toRecentItem(row, member.id))}
        archivedExpenses={settleView.archived.map((row) =>
          toRecentItem(row, member.id),
        )}
        settleMarkerLabel={settleMarkerLabel}
      />
    </AppShell>
  );
}
