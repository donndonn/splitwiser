"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settlements } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { parseAmountToCents } from "@/lib/money";

export async function recordSettlementAction(
  groupId: string,
  formData: FormData,
) {
  const { member } = await requireMember(groupId);

  const fromMemberId = String(formData.get("fromMemberId") ?? "");
  const toMemberId = String(formData.get("toMemberId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!fromMemberId || !toMemberId) {
    throw new Error("Select who paid whom");
  }
  if (fromMemberId === toMemberId) {
    throw new Error("Payer and recipient must be different");
  }

  const amountCents = parseAmountToCents(amountRaw);
  if (amountCents <= 0) throw new Error("Amount must be greater than zero");

  await db.insert(settlements).values({
    groupId,
    fromMemberId,
    toMemberId,
    amountCents,
    note,
    createdByMemberId: member.id,
  });

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
}
