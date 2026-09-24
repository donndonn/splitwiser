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
  beginGroupSettleView,
  catchIfAbandoned,
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
  const settle = beginGroupSettleView(id);
  const groupPromise = catchIfAbandoned(
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
  );
  const { member } = await requireMember(id);

  const [[group], settleView] = await Promise.all([
    groupPromise,
    settle.finish(member.id),
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
      actions={
        <Button asChild variant="ghost" size="icon">
          <Link href={`/g/${id}/settings`} aria-label="Settings">
            <Settings className="size-5" />
          </Link>
        </Button>
      }
    >
      <section className="mb-6 border-b border-border/70 pb-6" aria-label="Your balance">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your balance</p>
        <p className={net > 0 ? "mt-2 text-3xl font-semibold tracking-tight text-balance-positive" : net < 0 ? "mt-2 text-3xl font-semibold tracking-tight text-balance-negative" : "mt-2 text-3xl font-semibold tracking-tight"}>
          {net === 0
            ? "All settled up"
            : net > 0
              ? `You're owed ${formatMoney(net, group.currency)}`
              : `You owe ${formatMoney(-net, group.currency)}`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{balanceContext}</p>
        {net !== 0 && (
          <Button asChild variant="link" className="mt-3 h-auto px-0 text-primary">
            <Link href={`/g/${id}/balances`}>Settle up →</Link>
          </Button>
        )}
      </section>

      {settleView.showPrompt ? <MarkAsSettledPrompt groupId={id} /> : null}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
