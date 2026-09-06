"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { friendRequests, friendships } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { areFriends, orderedPair } from "@/lib/friends";

function revalidateFriendViews() {
  revalidatePath("/friends");
  revalidatePath("/");
  revalidatePath("/g/[id]/members", "page");
}

export async function sendFriendRequestAction(toUserId: string) {
  const user = await requireUser("/friends");
  if (toUserId === user.id) {
    throw new Error("You cannot add yourself");
  }

  if (await areFriends(user.id, toUserId)) {
    throw new Error("You are already friends");
  }

  const [incoming] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, toUserId),
        eq(friendRequests.toUserId, user.id),
      ),
    )
    .limit(1);

  if (incoming) {
    // They already requested you — accept instead.
    await acceptFriendRequestAction(incoming.id);
    return;
  }

  const [outgoing] = await db
    .select({ id: friendRequests.id })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, user.id),
        eq(friendRequests.toUserId, toUserId),
      ),
    )
    .limit(1);

  if (outgoing) {
    throw new Error("Friend request already sent");
  }

  await db.insert(friendRequests).values({
    fromUserId: user.id,
    toUserId,
  });

  revalidateFriendViews();
}

export async function acceptFriendRequestAction(requestId: string) {
  const user = await requireUser("/friends");

  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.toUserId, user.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!request) {
      throw new Error("Friend request not found");
    }

    const { userIdA, userIdB } = orderedPair(
      request.fromUserId,
      request.toUserId,
    );

    const [existing] = await tx
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(eq(friendships.userIdA, userIdA), eq(friendships.userIdB, userIdB)),
      )
      .limit(1);

    if (!existing) {
      await tx.insert(friendships).values({ userIdA, userIdB });
    }

    await tx
      .delete(friendRequests)
      .where(eq(friendRequests.id, request.id));

    // Clear any reverse pending request too.
    await tx
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.fromUserId, user.id),
          eq(friendRequests.toUserId, request.fromUserId),
        ),
      );
  });

  revalidateFriendViews();
}

export async function declineFriendRequestAction(requestId: string) {
  const user = await requireUser("/friends");
  await db
    .delete(friendRequests)
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.toUserId, user.id),
      ),
    );
  revalidateFriendViews();
}

export async function cancelFriendRequestAction(requestId: string) {
  const user = await requireUser("/friends");
  await db
    .delete(friendRequests)
    .where(
      and(
        eq(friendRequests.id, requestId),
        eq(friendRequests.fromUserId, user.id),
      ),
    );
  revalidateFriendViews();
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

  revalidateFriendViews();
}
