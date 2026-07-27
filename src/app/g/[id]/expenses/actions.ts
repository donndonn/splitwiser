"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  expenseItemAssignments,
  expenseItems,
  expenseSplits,
  expenses,
  members,
  type ExpenseEntryMode,
  type SplitMode,
} from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  assertAllowedMemberIds,
  calculateItemizedExpense,
  type ItemizedExpenseItemInput,
} from "@/lib/itemized-expense";
import { allocateSplits, parseAmountToCents } from "@/lib/money";

type SplitPayload = {
  memberId: string;
  amountCents: number;
  weight: number;
}[];

type ItemizedPayload = {
  items: ItemizedExpenseItemInput[];
};

const splitModes: SplitMode[] = ["equal", "exact", "percent", "shares"];
const entryModes: ExpenseEntryMode[] = ["simple", "itemized"];

function parseSplitPayload(raw: string): SplitPayload {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("At least one person must be included in the split");
  }

  const splits = parsed.map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid split");
    }
    const split = value as Record<string, unknown>;
    if (
      typeof split.memberId !== "string" ||
      !Number.isInteger(split.amountCents) ||
      Number(split.amountCents) < 0 ||
      typeof split.weight !== "number" ||
      !Number.isFinite(split.weight)
    ) {
      throw new Error("Invalid split");
    }
    return {
      memberId: split.memberId,
      amountCents: Number(split.amountCents),
      weight: split.weight,
    };
  });

  if (new Set(splits.map((split) => split.memberId)).size !== splits.length) {
    throw new Error("A person cannot appear more than once in a split");
  }
  return splits;
}

function parseItemizedPayload(raw: string): ItemizedPayload {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid itemized expense");
  }
  const itemsValue = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(itemsValue)) {
    throw new Error("Invalid receipt items");
  }

  return {
    items: itemsValue.map((value) => {
      if (!value || typeof value !== "object") {
        throw new Error("Invalid receipt item");
      }
      const item = value as Record<string, unknown>;
      if (
        typeof item.description !== "string" ||
        !Number.isInteger(item.amountCents) ||
        !Number.isInteger(item.quantity) ||
        !Array.isArray(item.memberIds) ||
        !item.memberIds.every((id) => typeof id === "string")
      ) {
        throw new Error("Invalid receipt item");
      }
      return {
        description: item.description.trim(),
        amountCents: Number(item.amountCents),
        quantity: Number(item.quantity),
        memberIds: item.memberIds,
      };
    }),
  };
}

async function getGroupMemberIds(groupId: string): Promise<Set<string>> {
  const roster = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.groupId, groupId));
  return new Set(roster.map(({ id }) => id));
}

function parseCommonFields(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");

  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  if (amountCents <= 0) throw new Error("Amount must be greater than zero");

  const paidByMemberId = String(formData.get("paidByMemberId") ?? "");
  const spentAtRaw = String(formData.get("spentAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const entryModeValue = String(formData.get("entryMode") ?? "simple");
  if (!entryModes.includes(entryModeValue as ExpenseEntryMode)) {
    throw new Error("Invalid expense entry mode");
  }

  return {
    description,
    amountCents,
    paidByMemberId,
    spentAt: spentAtRaw ? new Date(`${spentAtRaw}T12:00:00`) : new Date(),
    notes,
    entryMode: entryModeValue as ExpenseEntryMode,
  };
}

function parseExpenseDetails(
  formData: FormData,
  amountCents: number,
  entryMode: ExpenseEntryMode,
) {
  if (entryMode === "itemized") {
    const payload = parseItemizedPayload(
      String(formData.get("itemizedPayload") ?? "{}"),
    );
    const calculation = calculateItemizedExpense({
      amountCents,
      items: payload.items,
    });
    return {
      entryMode,
      splitMode: "exact" as const,
      taxCents: calculation.taxAndTipCents,
      tipCents: 0,
      feeCents: 0,
      discountCents: 0,
      items: payload.items,
      splits: calculation.splits,
    };
  }

  const splitModeValue = String(formData.get("splitMode") ?? "equal");
  if (!splitModes.includes(splitModeValue as SplitMode)) {
    throw new Error("Invalid split mode");
  }
  const submittedSplits = parseSplitPayload(
    String(formData.get("splitPayload") ?? "[]"),
  );
  const splits = allocateSplits(
    amountCents,
    splitModeValue as SplitMode,
    submittedSplits.map(({ memberId, weight }) => ({ memberId, weight })),
  );
  return {
    entryMode,
    splitMode: splitModeValue as SplitMode,
    taxCents: 0,
    tipCents: 0,
    feeCents: 0,
    discountCents: 0,
    items: [] as ItemizedExpenseItemInput[],
    splits,
  };
}

export async function createExpenseAction(groupId: string, formData: FormData) {
  const { member } = await requireMember(groupId);
  const common = parseCommonFields(formData);
  const details = parseExpenseDetails(
    formData,
    common.amountCents,
    common.entryMode,
  );
  const groupMemberIds = await getGroupMemberIds(groupId);
  assertAllowedMemberIds(
    [
      common.paidByMemberId,
      ...details.splits.map((split) => split.memberId),
      ...details.items.flatMap((item) => item.memberIds),
    ],
    groupMemberIds,
  );

  const expenseId = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        groupId,
        description: common.description,
        amountCents: common.amountCents,
        paidByMemberId: common.paidByMemberId,
        spentAt: common.spentAt,
        entryMode: details.entryMode,
        splitMode: details.splitMode,
        taxCents: details.taxCents,
        tipCents: details.tipCents,
        feeCents: details.feeCents,
        discountCents: details.discountCents,
        notes: common.notes,
        createdByMemberId: member.id,
      })
      .returning();

    await tx.insert(expenseSplits).values(
      details.splits.map((split) => ({
        expenseId: expense.id,
        memberId: split.memberId,
        amountCents: split.amountCents,
        weight: String(split.weight),
      })),
    );

    for (const [sortOrder, item] of details.items.entries()) {
      const [createdItem] = await tx
        .insert(expenseItems)
        .values({
          expenseId: expense.id,
          description: item.description,
          amountCents: item.amountCents,
          quantity: item.quantity,
          sortOrder,
        })
        .returning({ id: expenseItems.id });
      await tx.insert(expenseItemAssignments).values(
        item.memberIds.map((memberId) => ({
          expenseItemId: createdItem.id,
          memberId,
        })),
      );
    }

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
  const common = parseCommonFields(formData);
  const details = parseExpenseDetails(
    formData,
    common.amountCents,
    common.entryMode,
  );
  const groupMemberIds = await getGroupMemberIds(groupId);
  assertAllowedMemberIds(
    [
      common.paidByMemberId,
      ...details.splits.map((split) => split.memberId),
      ...details.items.flatMap((item) => item.memberIds),
    ],
    groupMemberIds,
  );

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(expenses)
      .set({
        description: common.description,
        amountCents: common.amountCents,
        paidByMemberId: common.paidByMemberId,
        spentAt: common.spentAt,
        entryMode: details.entryMode,
        splitMode: details.splitMode,
        taxCents: details.taxCents,
        tipCents: details.tipCents,
        feeCents: details.feeCents,
        discountCents: details.discountCents,
        notes: common.notes,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
      .returning({ id: expenses.id });

    if (updated.length === 0) {
      throw new Error("Expense not found");
    }

    await tx
      .delete(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId));
    await tx.delete(expenseItems).where(eq(expenseItems.expenseId, expenseId));

    await tx.insert(expenseSplits).values(
      details.splits.map((split) => ({
        expenseId,
        memberId: split.memberId,
        amountCents: split.amountCents,
        weight: String(split.weight),
      })),
    );

    for (const [sortOrder, item] of details.items.entries()) {
      const [createdItem] = await tx
        .insert(expenseItems)
        .values({
          expenseId,
          description: item.description,
          amountCents: item.amountCents,
          quantity: item.quantity,
          sortOrder,
        })
        .returning({ id: expenseItems.id });
      await tx.insert(expenseItemAssignments).values(
        item.memberIds.map((memberId) => ({
          expenseItemId: createdItem.id,
          memberId,
        })),
      );
    }
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
