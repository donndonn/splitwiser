"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  groupSettleMarkers,
  groupSettlePromptDismissals,
} from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  getGroupActivityWatermark,
  getGroupSettleView,
} from "@/lib/settle-marker-store";

function revalidateSettlePaths(groupId: string) {
  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/balances`);
}

export async function markGroupSettledAction(groupId: string) {
  const { member } = await requireMember(groupId);
  const view = await getGroupSettleView(groupId, member.id);

  if (!view.fullySettled) {
    throw new Error("Everyone needs to be settled up first");
  }
  if (view.openPeriodExpenseCount === 0) {
    throw new Error("There are no expenses to mark as settled");
  }

  const settledAt = new Date();
  if (
    view.activityWatermark &&
    settledAt.getTime() < view.activityWatermark.getTime()
  ) {
    settledAt.setTime(view.activityWatermark.getTime());
  }

  await db.transaction(async (tx) => {
    await tx.insert(groupSettleMarkers).values({
      groupId,
      settledAt,
      createdByMemberId: member.id,
    });

    await tx
      .delete(groupSettlePromptDismissals)
      .where(eq(groupSettlePromptDismissals.groupId, groupId));
  });

  revalidateSettlePaths(groupId);
}

export async function dismissSettlePromptAction(groupId: string) {
  const { member } = await requireMember(groupId);
  const watermark =
    (await getGroupActivityWatermark(groupId)) ?? new Date();

  await db
    .insert(groupSettlePromptDismissals)
    .values({
      groupId,
      memberId: member.id,
      activityWatermark: watermark,
      dismissedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        groupSettlePromptDismissals.groupId,
        groupSettlePromptDismissals.memberId,
      ],
      set: {
        activityWatermark: watermark,
        dismissedAt: new Date(),
      },
    });

  revalidateSettlePaths(groupId);
}
