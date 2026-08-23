import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { groups, members, settlements } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { getGroupBalances } from "@/lib/balances";
import { formatCents, formatMoney, suggestSettlements } from "@/lib/money";
import { cn, groupedListClass } from "@/lib/utils";
import { RecordPaymentForm } from "./record-payment-form";
import { recordSettlementAction } from "./actions";

export default async function BalancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMember(id);

  const [[group], roster, balances, recentSettlements] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    db
      .select()
      .from(members)
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
    getGroupBalances(id),
    db
      .select()
      .from(settlements)
      .where(eq(settlements.groupId, id))
      .orderBy(desc(settlements.settledAt))
      .limit(10),
  ]);

  if (!group) return null;

  const nameById = new Map(roster.map((m) => [m.id, m.displayName]));
  const balanceById = new Map(balances.map((b) => [b.memberId, b.netCents]));

  const rows = roster.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    netCents: balanceById.get(m.id) ?? 0,
  }));

  const suggestions = suggestSettlements(
    rows.map((r) => ({ memberId: r.memberId, netCents: r.netCents })),
  );

  return (
    <AppShell title="Balances" backHref={`/g/${id}`} withBottomNav>
      <div className={cn(groupedListClass, "mb-6")}>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.memberId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar size="sm">
                  <AvatarFallback>
                    {r.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">
                  {r.displayName}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-medium",
                  r.netCents > 0
                    ? "text-balance-positive"
                    : r.netCents < 0
                      ? "text-balance-negative"
                      : "text-muted-foreground",
                )}
              >
                {r.netCents === 0
                  ? "settled"
                  : r.netCents > 0
                    ? `owed ${formatMoney(r.netCents, group.currency)}`
                    : `owes ${formatMoney(-r.netCents, group.currency)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {suggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Suggested settle-up
          </h2>
          <div className={groupedListClass}>
            <ul className="divide-y divide-border">
              {suggestions.map((s) => (
                <li
                  key={`${s.fromMemberId}-${s.toMemberId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <p className="min-w-0 truncate text-sm">
                    {nameById.get(s.fromMemberId)} pays{" "}
                    {nameById.get(s.toMemberId)}{" "}
                    <span className="font-medium">
                      {formatMoney(s.amountCents, group.currency)}
                    </span>
                  </p>
                  <form
                    action={async () => {
                      "use server";
                      const fd = new FormData();
                      fd.set("fromMemberId", s.fromMemberId);
                      fd.set("toMemberId", s.toMemberId);
                      fd.set("amount", formatCents(s.amountCents));
                      await recordSettlementAction(id, fd);
                    }}
                  >
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                    >
                      Record
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {suggestions.length === 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">All settled</CardTitle>
            <CardDescription>
              Everyone is even. Nice work.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <RecordPaymentForm
        groupId={id}
        members={roster.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }))}
        currency={group.currency}
      />

      {recentSettlements.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent payments
          </h2>
          <div className={groupedListClass}>
            <ul className="divide-y divide-border text-sm text-muted-foreground">
              {recentSettlements.map((s) => (
                <li key={s.id} className="truncate px-4 py-2.5">
                  {nameById.get(s.fromMemberId)} → {nameById.get(s.toMemberId)}{" "}
                  · {formatMoney(s.amountCents, group.currency)}
                  {s.note ? ` · ${s.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
}
