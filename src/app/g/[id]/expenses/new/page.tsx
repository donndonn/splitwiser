import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { ExpenseForm } from "@/components/expense-form";
import { GroupBottomNav } from "@/components/group-bottom-nav";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { createExpenseAction } from "../actions";

export default async function NewExpensePage({
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

  const roster = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(eq(members.groupId, id))
    .orderBy(members.createdAt);

  if (!group) return null;

  const action = createExpenseAction.bind(null, id);

  return (
    <>
      <AppShell title="Add expense" backHref={`/g/${id}`} withBottomNav>
        <ExpenseForm
          members={roster}
          currency={group.currency}
          defaultPaidById={member.id}
          action={action}
          submitLabel="Add expense"
        />
      </AppShell>
      <GroupBottomNav groupId={id} />
    </>
  );
}
