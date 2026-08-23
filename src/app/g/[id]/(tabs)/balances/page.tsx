import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { db } from "@/db";
import { groups, members, settlements } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { getGroupBalances } from "@/lib/balances";
import { formatMoney, suggestSettlements } from "@/lib/money";
import { cn, groupedListClass } from "@/lib/utils";
import { RecentPaymentsList } from "./recent-payments-list";
import { SettleUpSection } from "./settle-up-section";

export default async function BalancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMember(id);

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
      .limit(50),
  ]);

  if (!group) return null;

  const nameById = new Map(roster.map((m) => [m.id, m.displayName]));
  const balanceById = new Map(balances.map((b) => [b.memberId, b.netCents]));

  const orderedRoster = [
    ...roster.filter((m) => m.id === member.id),
    ...roster.filter((m) => m.id !== member.id),
  ];

  const rows = orderedRoster.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    netCents: balanceById.get(m.id) ?? 0,
    isYou: m.id === member.id,
  }));

  const suggestions = suggestSettlements(
    roster.map((r) => ({
      memberId: r.id,
      netCents: balanceById.get(r.id) ?? 0,
    })),
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
                  {r.isYou ? " (you)" : ""}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-medium",
                  r.netCents > 0
                    ? "text-emerald-600"
                    : r.netCents < 0
                      ? "text-rose-600"
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

      <SettleUpSection
        groupId={id}
        currency={group.currency}
        currentMemberId={member.id}
        members={roster.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }))}
        suggestions={suggestions}
      />

      <RecentPaymentsList
        groupId={id}
        currency={group.currency}
        payments={recentSettlements.map((s) => ({
          id: s.id,
          fromName: nameById.get(s.fromMemberId) ?? "Someone",
          toName: nameById.get(s.toMemberId) ?? "someone",
          amountCents: s.amountCents,
          note: s.note,
          settledAtLabel: s.settledAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        }))}
      />
    </AppShell>
  );
}
