"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { expenseSplits, expenses, type SplitMode } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { parseAmountToCents } from "@/lib/money";

type SplitPayload = {
  memberId: string;
  amountCents: number;
  weight: number;
}[];

function parseSplitPayload(raw: string): SplitPayload {
  const parsed = JSON.parse(raw) as SplitPayload;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("At least one person must be included in the split");
  }
  return parsed;
}

export async function createExpenseAction(groupId: string, formData: FormData) {
  const { member } = await requireMember(groupId);

  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const paidByMemberId = String(formData.get("paidByMemberId") ?? "");
  const spentAtRaw = String(formData.get("spentAt") ?? "");
  const splitMode = String(formData.get("splitMode") ?? "equal") as SplitMode;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const splits = parseSplitPayload(String(formData.get("splitPayload") ?? "[]"));

  if (!description) throw new Error("Description is required");
  const amountCents = parseAmountToCents(amountRaw);
  if (amountCents <= 0) throw new Error("Amount must be greater than zero");

  const splitSum = splits.reduce((s, x) => s + x.amountCents, 0);
  if (splitSum !== amountCents) {
    throw new Error("Splits must sum to the expense total");
  }

  const spentAt = spentAtRaw ? new Date(`${spentAtRaw}T12:00:00`) : new Date();

  const expenseId = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        groupId,
        description,
        amountCents,
        paidByMemberId,
        spentAt,
        splitMode,
        notes,
        createdByMemberId: member.id,
      })
      .returning();

    await tx.insert(expenseSplits).values(
      splits.map((s) => ({
        expenseId: expense.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        weight: String(s.weight),
      })),
    );

    return expense.id;
  });

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
  redirect(`/g/${groupId}/expenses/${expenseId}`);
}

export async function updateExpenseAction(
  groupId: string,
  expenseId: string,
  formData: FormData,
) {
  await requireMember(groupId);

  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const paidByMemberId = String(formData.get("paidByMemberId") ?? "");
  const spentAtRaw = String(formData.get("spentAt") ?? "");
  const splitMode = String(formData.get("splitMode") ?? "equal") as SplitMode;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const splits = parseSplitPayload(String(formData.get("splitPayload") ?? "[]"));

  if (!description) throw new Error("Description is required");
  const amountCents = parseAmountToCents(amountRaw);
  if (amountCents <= 0) throw new Error("Amount must be greater than zero");

  const splitSum = splits.reduce((s, x) => s + x.amountCents, 0);
  if (splitSum !== amountCents) {
    throw new Error("Splits must sum to the expense total");
  }

  const spentAt = spentAtRaw ? new Date(`${spentAtRaw}T12:00:00`) : new Date();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(expenses)
      .set({
        description,
        amountCents,
        paidByMemberId,
        spentAt,
        splitMode,
        notes,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
      .returning();

    if (updated.length === 0) {
      throw new Error("Expense not found");
    }

    await tx
      .delete(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId));

    await tx.insert(expenseSplits).values(
      splits.map((s) => ({
        expenseId,
        memberId: s.memberId,
        amountCents: s.amountCents,
        weight: String(s.weight),
      })),
    );
  });

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
  revalidatePath(`/g/${groupId}/expenses/${expenseId}`);
  redirect(`/g/${groupId}/expenses/${expenseId}`);
}

export async function deleteExpenseAction(groupId: string, expenseId: string) {
  await requireMember(groupId);

  await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)));

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
  redirect(`/g/${groupId}`);
}
