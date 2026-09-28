"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members, users } from "@/db/schema";
import { logGroupActivity } from "@/lib/activity";
import { requireAdmin, requireMember } from "@/lib/auth-guards";
import { areFriends, displayNameForUser } from "@/lib/friends";
import { changeGroupInviteLink, type InviteLinkChange } from "@/lib/invites";
import { changeGroupShareLink, type ShareLinkChange } from "@/lib/share-link";

/**
 * Create (or reuse), reset, or disable the group's single invitation link.
 * Returns the current token, or null after disabling.
 */
export async function changeInviteLinkAction(
  groupId: string,
  change: InviteLinkChange,
): Promise<string | null> {
  if (change !== "create" && change !== "reset" && change !== "disable") {
    throw new Error("Unknown invite change");
  }
  const { member } = await requireAdmin(groupId);
  const { token, replaced } = await changeGroupInviteLink(db, {
    groupId,
    actorMemberId: member.id,
    change,
  });
  if (replaced) {
    console.info("[invites] invitation replaced", { groupId, change });
  }
  revalidatePath(`/g/${groupId}/members`);
  return token;
}

/**
 * Turn on (or reuse), reset, or turn off the group's read-only share link.
 * Returns the current token, or null once sharing is off.
 */
export async function changeShareLinkAction(
  groupId: string,
  change: ShareLinkChange,
): Promise<string | null> {
  if (change !== "create" && change !== "reset" && change !== "disable") {
    throw new Error("Unknown share link change");
  }
  await requireAdmin(groupId);
  const token = await changeGroupShareLink(db, { groupId, change });
  revalidatePath(`/g/${groupId}/members`);
  return token;
}

export type AddedMember = { id: string; displayName: string };

async function assertNameFree(groupId: string, displayName: string) {
  const [nameTaken] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.groupId, groupId),
        sql`lower(${members.displayName}) = lower(${displayName})`,
      ),
    )
    .limit(1);

  if (nameTaken) {
    throw new Error(
      `Someone in this group is already named "${displayName}". Rename them first, then try again.`,
    );
  }
}

function revalidateMemberPaths(groupId: string) {
  revalidatePath(`/g/${groupId}/members`);
  revalidatePath(`/g/${groupId}`);
  revalidatePath(`/g/${groupId}/activity`);
  revalidatePath(`/g/${groupId}/expenses/new`);
  revalidatePath(`/g/${groupId}/expenses/scan`);
  revalidatePath("/");
}

export async function addPlaceholderAction(
  groupId: string,
  formData: FormData,
): Promise<AddedMember> {
  const { member: actor } = await requireAdmin(groupId);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Name is required");

  await assertNameFree(groupId, displayName);

  const added = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(members)
      .values({
        groupId,
        displayName,
        userId: null,
        isAdmin: false,
      })
      .returning({ id: members.id, displayName: members.displayName });

    await logGroupActivity(tx, {
      groupId,
      type: "member_joined",
      actorMemberId: actor.id,
      payload: {
        actorName: actor.displayName,
        memberName: displayName,
      },
    });

    return row;
  });

  revalidateMemberPaths(groupId);
  return added;
}

/** `<form action>` wrapper; forms need a void result. */
export async function addPlaceholderFormAction(
  groupId: string,
  formData: FormData,
): Promise<void> {
  await addPlaceholderAction(groupId, formData);
}

export async function addFriendAsMemberAction(
  groupId: string,
  friendUserId: string,
): Promise<AddedMember> {
  const { user, member: actor } = await requireAdmin(groupId);

  if (!(await areFriends(user.id, friendUserId))) {
    throw new Error("That person is not your friend");
  }

  const [existing] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(eq(members.groupId, groupId), eq(members.userId, friendUserId)),
    )
    .limit(1);

  if (existing) {
    throw new Error("They are already in this group");
  }

  const [friend] = await db
    .select()
    .from(users)
    .where(eq(users.id, friendUserId))
    .limit(1);

  if (!friend || friend.onboardingCompletedAt == null) {
    throw new Error("User not found");
  }

  const displayName = displayNameForUser(friend);
  await assertNameFree(groupId, displayName);

  const added = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(members)
      .values({
        groupId,
        userId: friendUserId,
        displayName,
        isAdmin: false,
      })
      .returning({ id: members.id, displayName: members.displayName });

    await logGroupActivity(tx, {
      groupId,
      type: "member_joined",
      actorMemberId: actor.id,
      payload: {
        actorName: actor.displayName,
        memberName: displayName,
      },
    });

    return row;
  });

  revalidateMemberPaths(groupId);
  return added;
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

  await logGroupActivity(db, {
    groupId,
    type: "member_left",
    actorMemberId: actor.id,
    payload: {
      actorName: actor.displayName,
      memberName: target.displayName,
    },
  });

  revalidatePath(`/g/${groupId}/members`);
  revalidatePath(`/g/${groupId}/activity`);
}
