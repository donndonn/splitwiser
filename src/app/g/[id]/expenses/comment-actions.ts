"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenseComments, expenseSplits, expenses } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { canDeleteComment, parseCommentBody } from "@/lib/expense-comments";
import { commentPushBody } from "@/lib/push";
import { notifyGroupMembers } from "@/lib/push-send";

export type CommentFormState = { error: string | null; postedAt?: number };

export async function addExpenseCommentAction(
  groupId: string,
  expenseId: string,
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const { member } = await requireMember(groupId);
  const parsed = parseCommentBody(formData.get("body"));
  if (!parsed.ok) return { error: parsed.error };

  const [expense] = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      paidByMemberId: expenses.paidByMemberId,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!expense) return { error: "This expense no longer exists." };

  await db.insert(expenseComments).values({
    expenseId,
    authorMemberId: member.id,
    body: parsed.body,
  });

  // Everyone on the expense, plus anyone already in the conversation.
  const [splitRows, commenterRows] = await Promise.all([
    db
      .select({ memberId: expenseSplits.memberId })
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId)),
    db
      .selectDistinct({ memberId: expenseComments.authorMemberId })
      .from(expenseComments)
      .where(
        and(
          eq(expenseComments.expenseId, expenseId),
          isNotNull(expenseComments.authorMemberId),
        ),
      ),
  ]);
  notifyGroupMembers({
    groupId,
    memberIds: [
      expense.paidByMemberId,
      ...splitRows.map((row) => row.memberId),
      ...commenterRows.map((row) => row.memberId),
    ],
    actorMemberId: member.id,
    body: () =>
      commentPushBody(member.displayName, expense.description, parsed.body),
    url: `/g/${groupId}/expenses/${expenseId}`,
  });

  revalidatePath(`/g/${groupId}/expenses/${expenseId}`);
  return { error: null, postedAt: Date.now() };
}

export async function deleteExpenseCommentAction(
  groupId: string,
  expenseId: string,
  commentId: string,
): Promise<void> {
  const { member } = await requireMember(groupId);

  const [comment] = await db
    .select({ authorMemberId: expenseComments.authorMemberId })
    .from(expenseComments)
    .innerJoin(expenses, eq(expenseComments.expenseId, expenses.id))
    .where(
      and(
        eq(expenseComments.id, commentId),
        eq(expenseComments.expenseId, expenseId),
        eq(expenses.groupId, groupId),
      ),
    )
    .limit(1);
  if (!comment || !canDeleteComment(comment, member)) return;

  await db.delete(expenseComments).where(eq(expenseComments.id, commentId));
  revalidatePath(`/g/${groupId}/expenses/${expenseId}`);
}
