"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { friendInvites, friendships } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { isInviteLive, orderedPair } from "@/lib/friends";

export async function createFriendInviteAction(formData: FormData) {
  const user = await requireUser("/friends");

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

  const token = nanoid(24);

  await db.insert(friendInvites).values({
    token,
    createdByUserId: user.id,
    expiresAt,
    maxUses,
  });

  revalidatePath("/friends");
  return token;
}

export async function revokeFriendInviteAction(inviteId: string) {
  const user = await requireUser("/friends");
  await db
    .update(friendInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(friendInvites.id, inviteId),
        eq(friendInvites.createdByUserId, user.id),
      ),
    );
  revalidatePath("/friends");
}

export async function removeFriendAction(friendUserId: string) {
  const user = await requireUser("/friends");
  if (friendUserId === user.id) {
    throw new Error("Cannot remove yourself");
  }

  const { userIdA, userIdB } = orderedPair(user.id, friendUserId);
  await db
    .delete(friendships)
    .where(
      and(eq(friendships.userIdA, userIdA), eq(friendships.userIdB, userIdB)),
    );

  revalidatePath("/friends");
  revalidatePath("/");
}

export async function acceptFriendInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser(`/friends/join/${token}`);

  await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(friendInvites)
      .where(eq(friendInvites.token, token))
      .limit(1)
      .for("update");

    if (!invite || !isInviteLive(invite)) {
      throw new Error("This invite is no longer valid");
    }

    if (invite.createdByUserId === user.id) {
      throw new Error("You cannot accept your own invite");
    }

    const { userIdA, userIdB } = orderedPair(invite.createdByUserId, user.id);

    const [existing] = await tx
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userIdA, userIdA), eq(friendships.userIdB, userIdB)),
      )
      .limit(1);

    if (!existing) {
      await tx.insert(friendships).values({ userIdA, userIdB });
      await tx
        .update(friendInvites)
        .set({ uses: sql`${friendInvites.uses} + 1` })
        .where(eq(friendInvites.id, invite.id));
    }
  });

  revalidatePath("/friends");
  revalidatePath("/");
  redirect("/friends");
}
