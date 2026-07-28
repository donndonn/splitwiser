import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { friendships, users, type User } from "@/db/schema";

export function orderedPair(
  userId1: string,
  userId2: string,
): { userIdA: string; userIdB: string } {
  return userId1 < userId2
    ? { userIdA: userId1, userIdB: userId2 }
    : { userIdA: userId2, userIdB: userId1 };
}

export function displayNameForUser(
  user: Pick<User, "name" | "email"> | { name?: string | null; email?: string | null },
): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Friend";
}

export type FriendUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  displayName: string;
};

export async function listFriends(userId: string): Promise<FriendUser[]> {
  const pairs = await db
    .select()
    .from(friendships)
    .where(
      or(eq(friendships.userIdA, userId), eq(friendships.userIdB, userId)),
    );

  if (pairs.length === 0) return [];

  const friendIds = pairs.map((p) =>
    p.userIdA === userId ? p.userIdB : p.userIdA,
  );

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(inArray(users.id, friendIds));

  return rows
    .map((row) => ({
      ...row,
      displayName: displayNameForUser(row),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function areFriends(
  userId1: string,
  userId2: string,
): Promise<boolean> {
  if (userId1 === userId2) return false;
  const { userIdA, userIdB } = orderedPair(userId1, userId2);
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(eq(friendships.userIdA, userIdA), eq(friendships.userIdB, userIdB)),
    )
    .limit(1);
  return row != null;
}

export function isInviteLive(invite: {
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
