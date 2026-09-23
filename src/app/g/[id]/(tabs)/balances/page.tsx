import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { MarkAsSettledPrompt } from "@/components/mark-as-settled-prompt";
import { db } from "@/db";
import { groups, members, settlements, users } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { suggestSettlements } from "@/lib/money";
import {
  beginGroupSettleView,
  catchIfAbandoned,
} from "@/lib/settle-marker-store";
import { RecentPaymentsList } from "./recent-payments-list";
import { SettleUpSection } from "./settle-up-section";

export default async function BalancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const settle = beginGroupSettleView(id);
  const groupPromise = catchIfAbandoned(
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
  );
  const rosterPromise = catchIfAbandoned(
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        venmoUsername: users.venmoUsername,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
  );
  const settlementsPromise = catchIfAbandoned(
    db
      .select()
      .from(settlements)
      .where(eq(settlements.groupId, id))
      .orderBy(desc(settlements.settledAt))
      .limit(50),
  );
  const { member } = await requireMember(id);

  const [[group], roster, recentSettlements, settleView] = await Promise.all([
    groupPromise,
    rosterPromise,
    settlementsPromise,
    settle.finish(member.id),
  ]);

  if (!group) return null;

  const nameById = new Map(roster.map((m) => [m.id, m.displayName]));
  const balanceById = new Map(
    settleView.balances.map((b) => [b.memberId, b.netCents]),
  );

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
    <AppShell title="Balances" backHref={`/g/${id}`}>
      {settleView.showPrompt ? <MarkAsSettledPrompt groupId={id} /> : null}

      <SettleUpSection
        groupId={id}
        groupName={group.name}
        currency={group.currency}
        currentMemberId={member.id}
        members={roster.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          venmoUsername: m.venmoUsername,
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
