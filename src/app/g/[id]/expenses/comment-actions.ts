"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenseComments, expenses } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { canDeleteComment, parseCommentBody } from "@/lib/expense-comments";

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
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  if (!expense) return { error: "This expense no longer exists." };

  await db.insert(expenseComments).values({
    expenseId,
    authorMemberId: member.id,
    body: parsed.body,
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
