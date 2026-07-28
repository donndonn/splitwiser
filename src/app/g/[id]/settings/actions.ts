"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { logGroupActivity } from "@/lib/activity";
import { requireAdmin, requireMember } from "@/lib/auth-guards";

export async function updateGroupSettingsAction(
  groupId: string,
  formData: FormData,
) {
  const { member } = await requireAdmin(groupId);

  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD")
    .trim()
    .toUpperCase();

  if (!name) throw new Error("Name is required");

  const [existing] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  await db
    .update(groups)
    .set({ name, currency })
    .where(eq(groups.id, groupId));

  if (existing && existing.name !== name) {
    await logGroupActivity(db, {
      groupId,
      type: "group_renamed",
      actorMemberId: member.id,
      payload: {
        actorName: member.displayName,
        oldName: existing.name,
        newName: name,
      },
    });
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/settings`);
  revalidatePath(`/g/${groupId}/activity`);
  revalidatePath("/");
}

export async function leaveGroupAction(groupId: string) {
  const { member } = await requireMember(groupId);

  if (member.isAdmin) {
    const otherAdmins = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.isAdmin, true),
          ne(members.id, member.id),
        ),
      );
    if (otherAdmins.length === 0) {
      const others = await db
        .select()
        .from(members)
        .where(and(eq(members.groupId, groupId), ne(members.id, member.id)))
        .limit(1);
      if (others.length > 0) {
        throw new Error(
          "Make someone else an admin before leaving, or delete the group",
        );
      }
    }
  }

  // Unlink account but keep the member row so expense history stays intact.
  await db.transaction(async (tx) => {
    await logGroupActivity(tx, {
      groupId,
      type: "member_left",
      actorMemberId: member.id,
      payload: {
        actorName: member.displayName,
        memberName: member.displayName,
      },
    });

    await tx
      .update(members)
      .set({ userId: null, isAdmin: false })
      .where(eq(members.id, member.id));
  });

  revalidatePath("/");
  redirect("/");
}

export async function deleteGroupAction(groupId: string) {
  await requireAdmin(groupId);
  await db.delete(groups).where(eq(groups.id, groupId));
  revalidatePath("/");
  redirect("/");
}

export async function promoteAdminAction(groupId: string, memberId: string) {
  await requireAdmin(groupId);
  await db
    .update(members)
    .set({ isAdmin: true })
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  revalidatePath(`/g/${groupId}/settings`);
  revalidatePath(`/g/${groupId}/members`);
}
