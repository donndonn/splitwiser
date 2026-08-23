"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members, settlements } from "@/db/schema";
import { logGroupActivity } from "@/lib/activity";
import { requireMember } from "@/lib/auth-guards";
import { getGroupBalances } from "@/lib/balances";
import { parseAmountToCents, suggestSettlements } from "@/lib/money";

function revalidateSettlementPaths(groupId: string) {
  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
  revalidatePath(`/g/${groupId}/activity`);
}

async function namesForMembers(groupId: string, memberIds: string[]) {
  const unique = [...new Set(memberIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const rows = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(and(eq(members.groupId, groupId), inArray(members.id, unique)));

  if (rows.length !== unique.length) {
    throw new Error("Those people are not in this group");
  }

  return new Map(rows.map((row) => [row.id, row.displayName]));
}

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

  const nameById = await namesForMembers(groupId, [fromMemberId, toMemberId]);

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

  revalidateSettlementPaths(groupId);
}

/** Record every remaining suggested transfer so the group nets to zero. */
export async function settleGroupAction(groupId: string) {
  const { member } = await requireMember(groupId);

  const [roster, balances] = await Promise.all([
    db
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(eq(members.groupId, groupId)),
    getGroupBalances(groupId),
  ]);

  const balanceById = new Map(
    balances.map((row) => [row.memberId, row.netCents]),
  );
  const suggestions = suggestSettlements(
    roster.map((row) => ({
      memberId: row.id,
      netCents: balanceById.get(row.id) ?? 0,
    })),
  );

  if (suggestions.length === 0) {
    throw new Error("Everyone is already settled");
  }

  const nameById = new Map(roster.map((row) => [row.id, row.displayName]));

  await db.transaction(async (tx) => {
    for (const suggestion of suggestions) {
      await tx.insert(settlements).values({
        groupId,
        fromMemberId: suggestion.fromMemberId,
        toMemberId: suggestion.toMemberId,
        amountCents: suggestion.amountCents,
        note: "Group settle-up",
        createdByMemberId: member.id,
      });

      await logGroupActivity(tx, {
        groupId,
        type: "settlement_recorded",
        actorMemberId: member.id,
        payload: {
          actorName: member.displayName,
          fromName: nameById.get(suggestion.fromMemberId) ?? "Someone",
          toName: nameById.get(suggestion.toMemberId) ?? "someone",
          amountCents: suggestion.amountCents,
        },
      });
    }
  });

  revalidateSettlementPaths(groupId);
}

export async function reverseSettlementAction(
  groupId: string,
  settlementId: string,
) {
  const { member } = await requireMember(groupId);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(settlements)
      .where(
        and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Payment not found");
    }

    const nameRows = await tx
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(
        inArray(members.id, [existing.fromMemberId, existing.toMemberId]),
      );
    const nameById = new Map(nameRows.map((row) => [row.id, row.displayName]));

    await logGroupActivity(tx, {
      groupId,
      type: "settlement_deleted",
      actorMemberId: member.id,
      payload: {
        actorName: member.displayName,
        fromName: nameById.get(existing.fromMemberId) ?? "someone",
        toName: nameById.get(existing.toMemberId) ?? "someone",
        amountCents: existing.amountCents,
      },
    });

    await tx
      .delete(settlements)
      .where(
        and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId)),
      );
  });

  revalidateSettlementPaths(groupId);
  return { ok: true as const };
}
