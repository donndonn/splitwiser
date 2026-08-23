import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { groups, members, settlements } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { getGroupBalances } from "@/lib/balances";
import { suggestSettlements } from "@/lib/money";
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

  const rows = [
    ...roster.filter((m) => m.id === member.id),
    ...roster.filter((m) => m.id !== member.id),
  ].map((m) => ({
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
      <SettleUpSection
        groupId={id}
        currency={group.currency}
        currentMemberId={member.id}
        members={roster.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        }))}
        rows={rows}
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
