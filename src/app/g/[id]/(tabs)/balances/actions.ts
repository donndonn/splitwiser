"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members, settlements } from "@/db/schema";
import { logGroupActivity } from "@/lib/activity";
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

  const partyIds = [...new Set([fromMemberId, toMemberId])];
  const partyMembers = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(inArray(members.id, partyIds));
  const nameById = new Map(partyMembers.map((m) => [m.id, m.displayName]));

  await db.transaction(async (tx) => {
    await tx.insert(settlements).values({
      groupId,
      fromMemberId,
      toMemberId,
      amountCents,
      note,
      createdByMemberId: member.id,
    });

    await logGroupActivity(tx, {
      groupId,
      type: "settlement_recorded",
      actorMemberId: member.id,
      payload: {
        actorName: member.displayName,
        fromName: nameById.get(fromMemberId) ?? "Someone",
        toName: nameById.get(toMemberId) ?? "someone",
        amountCents,
      },
    });
  });

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
  revalidatePath(`/g/${groupId}/activity`);
}
