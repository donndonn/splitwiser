"use server";

import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { invites, members } from "@/db/schema";
import { requireAdmin, requireMember } from "@/lib/auth-guards";

export async function createInviteAction(groupId: string, formData: FormData) {
  await requireAdmin(groupId);

  const expiresIn = String(formData.get("expiresIn") ?? "7d");
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();

  let expiresAt: Date | null = null;
  if (expiresIn === "1d") {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else if (expiresIn === "7d") {
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  } else if (expiresIn === "30d") {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const maxUses = maxUsesRaw === "" ? null : Number(maxUsesRaw);
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    throw new Error("Max uses must be a positive integer");
  }

  const { member } = await requireAdmin(groupId);
  const token = nanoid(24);

  await db.insert(invites).values({
    groupId,
    token,
    expiresAt,
    maxUses,
    createdByMemberId: member.id,
  });

  revalidatePath(`/g/${groupId}/members`);
  return token;
}

export async function revokeInviteAction(groupId: string, inviteId: string) {
  await requireAdmin(groupId);
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.groupId, groupId)));
  revalidatePath(`/g/${groupId}/members`);
}

export async function addPlaceholderAction(
  groupId: string,
  formData: FormData,
) {
  await requireAdmin(groupId);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Name is required");

  await db.insert(members).values({
    groupId,
    displayName,
    userId: null,
    isAdmin: false,
  });

  revalidatePath(`/g/${groupId}/members`);
}

export async function renameMemberAction(
  groupId: string,
  memberId: string,
  formData: FormData,
) {
  const { member: actor } = await requireMember(groupId);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Name is required");

  if (!actor.isAdmin && actor.id !== memberId) {
    throw new Error("Not allowed");
  }

  await db
    .update(members)
    .set({ displayName })
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));

  revalidatePath(`/g/${groupId}/members`);
}

export async function removeMemberAction(groupId: string, memberId: string) {
  const { member: actor } = await requireAdmin(groupId);

  if (actor.id === memberId) {
    throw new Error("You cannot remove yourself");
  }

  const [target] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)))
    .limit(1);

  if (!target) return;

  if (target.isAdmin) {
    const otherAdmins = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.isAdmin, true),
          ne(members.id, memberId),
        ),
      );
    if (otherAdmins.length === 0) {
      throw new Error("Cannot remove the last admin");
    }
  }

  // Linked accounts: unlink to a placeholder so expense history stays intact.
  // True placeholders with no history can be deleted.
  if (target.userId != null) {
    await db
      .update(members)
      .set({ userId: null, isAdmin: false })
      .where(eq(members.id, memberId));
  } else {
    try {
      await db
        .delete(members)
        .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
    } catch {
      // Still referenced by expenses/settlements — keep as placeholder.
      await db
        .update(members)
        .set({ isAdmin: false })
        .where(eq(members.id, memberId));
    }
  }

  revalidatePath(`/g/${groupId}/members`);
}
