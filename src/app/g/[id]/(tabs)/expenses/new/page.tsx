import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { DescribeExpense } from "@/components/describe-expense";
import { SoloGroupGate } from "@/components/solo-group-prompt";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { listFriendsNotInGroup } from "@/lib/friends";
import { createExpenseAction } from "../../../expenses/actions";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, member } = await requireMember(id);

  const [[group], roster] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        userId: members.userId,
      })
      .from(members)
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
  ]);

  if (!group) return null;

  const friends = member.isAdmin
    ? (await listFriendsNotInGroup(user.id, roster)).map(
        ({ id, displayName, email, image }) => ({
          id,
          displayName,
          email,
          image,
        }),
      )
    : [];

  const action = createExpenseAction.bind(null, id);

  return (
    <AppShell title="Add expense" backHref={`/g/${id}`}>
      <SoloGroupGate
        groupId={id}
        initiallySolo={roster.length === 1}
        isAdmin={member.isAdmin}
        friends={friends}
      >
        <DescribeExpense
          groupId={id}
          members={roster.map(({ id, displayName }) => ({ id, displayName }))}
          currency={group.currency}
          defaultPaidById={member.id}
          canAddPeople={member.isAdmin}
          friends={friends}
          action={action}
        />
      </SoloGroupGate>
    </AppShell>
  );
}
