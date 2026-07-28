"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invites, members } from "@/db/schema";
import { logGroupActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth-guards";

function isInviteLive(invite: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
}) {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
  if (invite.maxUses != null && invite.uses >= invite.maxUses) return false;
  return true;
}

export async function joinAsNewMemberAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const user = await requireUser(`/join/${token}`);

  if (!displayName) {
    throw new Error("Display name is required");
  }

  const groupId = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1)
      .for("update");

    if (!invite || !isInviteLive(invite)) {
      throw new Error("This invite is no longer valid");
    }

    const [existing] = await tx
      .select()
      .from(members)
      .where(
        and(eq(members.groupId, invite.groupId), eq(members.userId, user.id)),
      )
      .limit(1);

    if (existing) {
      return invite.groupId;
    }

    const [created] = await tx
      .insert(members)
      .values({
        groupId: invite.groupId,
        userId: user.id,
        displayName,
        isAdmin: false,
      })
      .returning({ id: members.id });

    await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(eq(invites.id, invite.id));

    await logGroupActivity(tx, {
      groupId: invite.groupId,
      type: "member_joined",
      actorMemberId: created.id,
      payload: {
        actorName: displayName,
        memberName: displayName,
      },
    });

    return invite.groupId;
  });

  revalidatePath("/");
  revalidatePath(`/g/${groupId}/activity`);
  redirect(`/g/${groupId}`);
}

export async function claimPlaceholderAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const user = await requireUser(`/join/${token}`);

  const groupId = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1)
      .for("update");

    if (!invite || !isInviteLive(invite)) {
      throw new Error("This invite is no longer valid");
    }

    const [existing] = await tx
      .select()
      .from(members)
      .where(
        and(eq(members.groupId, invite.groupId), eq(members.userId, user.id)),
      )
      .limit(1);

    if (existing) {
      return invite.groupId;
    }

    const [placeholder] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.groupId, invite.groupId),
          isNull(members.userId),
        ),
      )
      .limit(1)
      .for("update");

    if (!placeholder) {
      throw new Error("That placeholder is no longer available");
    }

    await tx
      .update(members)
      .set({ userId: user.id })
      .where(eq(members.id, placeholder.id));

    await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(eq(invites.id, invite.id));

    await logGroupActivity(tx, {
      groupId: invite.groupId,
      type: "member_joined",
      actorMemberId: placeholder.id,
      payload: {
        actorName: placeholder.displayName,
        memberName: placeholder.displayName,
      },
    });

    return invite.groupId;
  });

  revalidatePath("/");
  revalidatePath(`/g/${groupId}/activity`);
  redirect(`/g/${groupId}`);
}
