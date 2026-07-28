import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { desc, eq, inArray } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import {
  expenses,
  groupActivities,
  groups,
  members,
  type GroupActivityPayload,
} from "@/db/schema";
import { formatActivityMessage } from "@/lib/activity";
import { requireMember } from "@/lib/auth-guards";
import { groupedListClass } from "@/lib/utils";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMember(id);

  const [[group], activities] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    db
      .select({
        id: groupActivities.id,
        type: groupActivities.type,
        expenseId: groupActivities.expenseId,
        payload: groupActivities.payload,
        createdAt: groupActivities.createdAt,
        actorDisplayName: members.displayName,
      })
      .from(groupActivities)
      .leftJoin(members, eq(groupActivities.actorMemberId, members.id))
      .where(eq(groupActivities.groupId, id))
      .orderBy(desc(groupActivities.createdAt))
      .limit(50),
  ]);

  if (!group) return null;

  const candidateExpenseIds = [
    ...new Set(
      activities
        .filter(
          (a) =>
            (a.type === "expense_created" || a.type === "expense_updated") &&
            a.expenseId,
        )
        .map((a) => a.expenseId as string),
    ),
  ];

  const existingExpenses =
    candidateExpenseIds.length === 0
      ? []
      : await db
          .select({ id: expenses.id })
          .from(expenses)
          .where(inArray(expenses.id, candidateExpenseIds));

  const linkableExpenseIds = new Set(existingExpenses.map((e) => e.id));

  return (
    <AppShell title="Activity" backHref={`/g/${id}`} withBottomNav>
      {activities.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No activity yet</CardTitle>
            <CardDescription>
              Expense changes, payments, and membership updates will show up
              here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className={groupedListClass}>
          <ul className="divide-y divide-border">
            {activities.map((activity) => {
              const payload: GroupActivityPayload = {
                ...activity.payload,
                actorName:
                  activity.actorDisplayName ?? activity.payload.actorName,
              };
              const message = formatActivityMessage(
                activity.type,
                payload,
                group.currency,
              );
              const href =
                activity.expenseId &&
                (activity.type === "expense_created" ||
                  activity.type === "expense_updated") &&
                linkableExpenseIds.has(activity.expenseId)
                  ? `/g/${id}/expenses/${activity.expenseId}`
                  : null;
              const timeLabel = formatDistanceToNow(activity.createdAt, {
                addSuffix: true,
              });

              const content = (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {message}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {timeLabel}
                  </p>
                </>
              );

              return (
                <li key={activity.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="block px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
