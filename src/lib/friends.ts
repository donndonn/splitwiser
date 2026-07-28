import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  friendRequests,
  friendships,
  users,
  type User,
} from "@/db/schema";

export function orderedPair(
  userId1: string,
  userId2: string,
): { userIdA: string; userIdB: string } {
  return userId1 < userId2
    ? { userIdA: userId1, userIdB: userId2 }
    : { userIdA: userId2, userIdB: userId1 };
}

export function displayNameForUser(
  user:
    | Pick<User, "name" | "email">
    | { name?: string | null; email?: string | null },
): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Friend";
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function validateUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username must be 3–20 characters: lowercase letters, numbers, or underscores",
    );
  }
  return username;
}

export type FriendUser = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  displayName: string;
};

function toFriendUser(
  row: Pick<User, "id" | "name" | "username" | "email" | "image">,
): FriendUser {
  return {
    ...row,
    displayName: displayNameForUser(row),
  };
}

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
      username: users.username,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(inArray(users.id, friendIds));

  return rows.map(toFriendUser).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
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

export type SearchHit = FriendUser & {
  status: "none" | "friends" | "outgoing" | "incoming";
};

/** Exact match on email or @username (case-insensitive). */
export async function findUserByEmailOrUsername(
  query: string,
  viewerId: string,
): Promise<SearchHit | null> {
  const q = query.trim();
  if (!q) return null;

  const isEmail = q.includes("@") && !q.startsWith("@");
  let row:
    | Pick<User, "id" | "name" | "username" | "email" | "image">
    | undefined;

  if (isEmail) {
    const [found] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${q.toLowerCase()}`)
      .limit(1);
    row = found;
  } else {
    const username = normalizeUsername(q);
    if (!username) return null;
    const [found] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(sql`lower(${users.username}) = ${username}`)
      .limit(1);
    row = found;
  }

  if (!row || row.id === viewerId) return null;

  let status: SearchHit["status"] = "none";
  if (await areFriends(viewerId, row.id)) {
    status = "friends";
  } else {
    const [outgoing] = await db
      .select({ id: friendRequests.id })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.fromUserId, viewerId),
          eq(friendRequests.toUserId, row.id),
        ),
      )
      .limit(1);
    if (outgoing) {
      status = "outgoing";
    } else {
      const [incoming] = await db
        .select({ id: friendRequests.id })
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.fromUserId, row.id),
            eq(friendRequests.toUserId, viewerId),
          ),
        )
        .limit(1);
      if (incoming) status = "incoming";
    }
  }

  return { ...toFriendUser(row), status };
}

export type PendingRequest = {
  id: string;
  createdAt: Date;
  user: FriendUser;
};

export async function listIncomingRequests(
  userId: string,
): Promise<PendingRequest[]> {
  const rows = await db
    .select({
      id: friendRequests.id,
      createdAt: friendRequests.createdAt,
      userId: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      image: users.image,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.fromUserId))
    .where(eq(friendRequests.toUserId, userId))
    .orderBy(friendRequests.createdAt);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    user: toFriendUser({
      id: r.userId,
      name: r.name,
      username: r.username,
      email: r.email,
      image: r.image,
    }),
  }));
}

export async function listOutgoingRequests(
  userId: string,
): Promise<PendingRequest[]> {
  const rows = await db
    .select({
      id: friendRequests.id,
      createdAt: friendRequests.createdAt,
      userId: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      image: users.image,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.toUserId))
    .where(eq(friendRequests.fromUserId, userId))
    .orderBy(friendRequests.createdAt);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    user: toFriendUser({
      id: r.userId,
      name: r.name,
      username: r.username,
      email: r.email,
      image: r.image,
    }),
  }));
}
