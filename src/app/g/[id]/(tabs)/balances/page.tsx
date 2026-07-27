import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
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
      <ul className="mb-6 space-y-2">
        {rows.map((r) => (
          <li key={r.memberId}>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="text-sm font-medium">
                  {r.displayName}
                </CardTitle>
                <p
                  className={
                    r.netCents > 0
                      ? "text-sm font-medium text-emerald-600"
                      : r.netCents < 0
                        ? "text-sm font-medium text-rose-600"
                        : "text-sm text-muted-foreground"
                  }
                >
                  {r.netCents === 0
                    ? "settled"
                    : r.netCents > 0
                      ? `owed ${formatMoney(r.netCents, group.currency)}`
                      : `owes ${formatMoney(-r.netCents, group.currency)}`}
                </p>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>

      {suggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Suggested settle-up
          </h2>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={`${s.fromMemberId}-${s.toMemberId}`}>
                <Card>
                  <CardHeader className="space-y-2 py-3">
                    <CardTitle className="text-sm font-medium">
                      {nameById.get(s.fromMemberId)} pays{" "}
                      {nameById.get(s.toMemberId)}{" "}
                      {formatMoney(s.amountCents, group.currency)}
                    </CardTitle>
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
                      <Button type="submit" size="sm" variant="secondary">
                        Record this
                      </Button>
                    </form>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
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
          <ul className="space-y-2 text-sm">
            {recentSettlements.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border px-3 py-2 text-muted-foreground"
              >
                {nameById.get(s.fromMemberId)} → {nameById.get(s.toMemberId)}{" "}
                · {formatMoney(s.amountCents, group.currency)}
                {s.note ? ` · ${s.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
