import { and, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  friendRequests,
  friendships,
  users,
  type User,
} from "@/db/schema";
import {
  DEFAULT_PHONE_COUNTRY,
  looksLikePhone,
  normalizePhone,
  phoneCountry,
} from "@/lib/phone";

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
    .where(
      and(inArray(users.id, friendIds), isNotNull(users.onboardingCompletedAt)),
    );

  return rows.map(toFriendUser).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

/** Unfinished signups are hidden from discovery and cannot be added. */
export async function isOnboardedUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.onboardingCompletedAt)))
    .limit(1);
  return row != null;
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
  status: FriendStatus;
};

export type FriendStatus = "none" | "friends" | "outgoing" | "incoming";

type FriendshipPair = Pick<
  typeof friendships.$inferSelect,
  "userIdA" | "userIdB"
>;
type FriendRequestPair = Pick<
  typeof friendRequests.$inferSelect,
  "fromUserId" | "toUserId"
>;

export function deriveFriendStatuses(
  viewerId: string,
  targetUserIds: string[],
  friendshipPairs: FriendshipPair[],
  requestPairs: FriendRequestPair[],
): Map<string, FriendStatus> {
  const targetIds = new Set(targetUserIds.filter((id) => id !== viewerId));
  const statuses = new Map<string, FriendStatus>(
    [...targetIds].map((id) => [id, "none"]),
  );

  for (const pair of friendshipPairs) {
    const otherId = pair.userIdA === viewerId ? pair.userIdB : pair.userIdA;
    if (targetIds.has(otherId)) statuses.set(otherId, "friends");
  }

  for (const request of requestPairs) {
    const isOutgoing =
      request.fromUserId === viewerId && targetIds.has(request.toUserId);
    const isIncoming =
      request.toUserId === viewerId && targetIds.has(request.fromUserId);
    const otherId = isOutgoing
      ? request.toUserId
      : isIncoming
        ? request.fromUserId
        : null;

    if (otherId && statuses.get(otherId) !== "friends") {
      const currentStatus = statuses.get(otherId);
      if (isOutgoing || currentStatus === "none") {
        statuses.set(otherId, isOutgoing ? "outgoing" : "incoming");
      }
    }
  }

  return statuses;
}

export async function listFriendStatuses(
  viewerId: string,
  targetUserIds: string[],
): Promise<Map<string, FriendStatus>> {
  const targetIds = [...new Set(targetUserIds)].filter(
    (id) => id !== viewerId,
  );
  if (targetIds.length === 0) return new Map();

  const [friendshipPairs, requestPairs] = await Promise.all([
    db
      .select({
        userIdA: friendships.userIdA,
        userIdB: friendships.userIdB,
      })
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.userIdA, viewerId),
            inArray(friendships.userIdB, targetIds),
          ),
          and(
            eq(friendships.userIdB, viewerId),
            inArray(friendships.userIdA, targetIds),
          ),
        ),
      ),
    db
      .select({
        fromUserId: friendRequests.fromUserId,
        toUserId: friendRequests.toUserId,
      })
      .from(friendRequests)
      .where(
        or(
          and(
            eq(friendRequests.fromUserId, viewerId),
            inArray(friendRequests.toUserId, targetIds),
          ),
          and(
            eq(friendRequests.toUserId, viewerId),
            inArray(friendRequests.fromUserId, targetIds),
          ),
        ),
      ),
  ]);

  return deriveFriendStatuses(
    viewerId,
    targetIds,
    friendshipPairs,
    requestPairs,
  );
}

type SearchRow = Pick<User, "id" | "name" | "username" | "email" | "image">;

const searchColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  email: users.email,
  image: users.image,
};

async function findOnboardedUser(where: SQL): Promise<SearchRow | undefined> {
  const [found] = await db
    .select(searchColumns)
    .from(users)
    .where(and(where, isNotNull(users.onboardingCompletedAt)))
    .limit(1);
  return found;
}

/** Local-format numbers are read in the searcher's own phone region. */
async function viewerPhoneCountry(viewerId: string) {
  const [viewer] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, viewerId))
    .limit(1);
  return phoneCountry(viewer?.phone) ?? DEFAULT_PHONE_COUNTRY;
}

/**
 * Exact match on email, phone number, or @username (case-insensitive).
 * A digits-only query tries phone first, then falls back to a username.
 */
export async function findUserBySearchQuery(
  query: string,
  viewerId: string,
): Promise<SearchHit | null> {
  const q = query.trim();
  if (!q) return null;

  const isEmail = q.includes("@") && !q.startsWith("@");
  let row: SearchRow | undefined;

  if (isEmail) {
    row = await findOnboardedUser(
      sql`lower(${users.email}) = ${q.toLowerCase()}`,
    );
  } else {
    if (looksLikePhone(q)) {
      const phone = normalizePhone(q, await viewerPhoneCountry(viewerId));
      if (phone) row = await findOnboardedUser(eq(users.phone, phone));
    }
    const username = normalizeUsername(q);
    if (!row && USERNAME_RE.test(username)) {
      row = await findOnboardedUser(
        sql`lower(${users.username}) = ${username}`,
      );
    }
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

/** Your friends who aren't linked to any member of this roster yet. */
export async function listFriendsNotInGroup(
  userId: string,
  roster: readonly { userId: string | null }[],
): Promise<FriendUser[]> {
  const linked = new Set(roster.map((member) => member.userId));
  const friends = await listFriends(userId);
  return friends.filter((friend) => !linked.has(friend.id));
}
