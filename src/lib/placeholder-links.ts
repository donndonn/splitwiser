import { and, asc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { friendships, groups, members, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { logGroupActivity } from "@/lib/activity";
import { displayNameForUser } from "@/lib/friends";

/**
 * Someone a placeholder can be linked to: a friend of the admin, or anyone
 * who shares another group with them. Linking never exposes a group to a
 * stranger, because the admin must already know the account.
 */
export type LinkCandidate = {
  id: string;
  displayName: string;
  username: string | null;
  image: string | null;
  isFriend: boolean;
  /** Names of other groups the admin shares with them, for context. */
  sharedGroups: string[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True when the candidate plausibly is the placeholder: same full name,
 * same first name, or the placeholder is their username. Only used to
 * suggest; linking is always a person's choice.
 */
export function nameMatches(
  placeholderName: string,
  candidate: Pick<LinkCandidate, "displayName" | "username">,
): boolean {
  const target = normalizeName(placeholderName.replace(/^@+/, ""));
  if (!target) return false;
  const name = normalizeName(candidate.displayName);
  if (name === target) return true;
  if (candidate.username && candidate.username.toLowerCase() === target) {
    return true;
  }
  const [targetFirst] = target.split(" ");
  const [nameFirst] = name.split(" ");
  return targetFirst.length >= 2 && targetFirst === nameFirst;
}

/** Candidates that name-match the placeholder, best match first. */
export function suggestedCandidates(
  placeholderName: string,
  candidates: readonly LinkCandidate[],
): LinkCandidate[] {
  const exact = normalizeName(placeholderName);
  return candidates
    .filter((candidate) => nameMatches(placeholderName, candidate))
    .sort(
      (a, b) =>
        Number(normalizeName(b.displayName) === exact) -
        Number(normalizeName(a.displayName) === exact),
    );
}

/**
 * Friends of `userId` plus people sharing any other group with them, minus
 * anyone already linked to a member of `groupId`. Unfinished signups are
 * left out, as they are everywhere else.
 */
export async function listLinkCandidates(
  client: Db,
  input: { userId: string; groupId: string },
): Promise<LinkCandidate[]> {
  const mine = alias(members, "mine");
  const theirs = alias(members, "theirs");

  const [pairs, shared, inGroup] = await Promise.all([
    client
      .select()
      .from(friendships)
      .where(
        or(
          eq(friendships.userIdA, input.userId),
          eq(friendships.userIdB, input.userId),
        ),
      ),
    client
      .select({ userId: theirs.userId, groupName: groups.name })
      .from(mine)
      .innerJoin(theirs, eq(theirs.groupId, mine.groupId))
      .innerJoin(groups, eq(groups.id, mine.groupId))
      .where(
        and(
          eq(mine.userId, input.userId),
          ne(mine.groupId, input.groupId),
          isNotNull(theirs.userId),
          ne(theirs.userId, input.userId),
        ),
      )
      .orderBy(asc(groups.name)),
    client
      .select({ userId: members.userId })
      .from(members)
      .where(and(eq(members.groupId, input.groupId), isNotNull(members.userId))),
  ]);

  const friendIds = new Set(
    pairs.map((p) => (p.userIdA === input.userId ? p.userIdB : p.userIdA)),
  );
  const sharedGroups = new Map<string, string[]>();
  for (const row of shared) {
    const list = sharedGroups.get(row.userId!) ?? [];
    if (!list.includes(row.groupName)) list.push(row.groupName);
    sharedGroups.set(row.userId!, list);
  }
  const excluded = new Set(inGroup.map((row) => row.userId));
  excluded.add(input.userId);

  const ids = [...new Set([...friendIds, ...sharedGroups.keys()])].filter(
    (id) => !excluded.has(id),
  );
  if (ids.length === 0) return [];

  const rows = await client
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      image: users.image,
    })
    .from(users)
    .where(and(inArray(users.id, ids), isNotNull(users.onboardingCompletedAt)));

  return rows
    .map((row) => ({
      id: row.id,
      displayName: displayNameForUser(row),
      username: row.username,
      image: row.image,
      isFriend: friendIds.has(row.id),
      sharedGroups: sharedGroups.get(row.id) ?? [],
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Attach an account to a placeholder, keeping its name, expenses, and
 * balances. The account must be one the admin could pick (see
 * listLinkCandidates). Removing the member later unlinks it again.
 */
export async function linkPlaceholderToUser(
  client: Db,
  input: {
    groupId: string;
    memberId: string;
    targetUserId: string;
    actor: { userId: string; memberId: string; displayName: string };
  },
): Promise<{ displayName: string }> {
  const candidates = await listLinkCandidates(client, {
    userId: input.actor.userId,
    groupId: input.groupId,
  });
  if (!candidates.some((c) => c.id === input.targetUserId)) {
    throw new Error(
      "You can only link friends or people who share a group with you",
    );
  }

  return client.transaction(async (tx) => {
    const [placeholder] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, input.memberId),
          eq(members.groupId, input.groupId),
          isNull(members.userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!placeholder) {
      throw new Error("That placeholder is no longer available");
    }

    const [existing] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.groupId, input.groupId),
          eq(members.userId, input.targetUserId),
        ),
      )
      .limit(1);
    if (existing) throw new Error("They are already in this group");

    await tx
      .update(members)
      .set({ userId: input.targetUserId })
      .where(eq(members.id, placeholder.id));

    await logGroupActivity(tx, {
      groupId: input.groupId,
      type: "member_joined",
      actorMemberId: input.actor.memberId,
      payload: {
        actorName: input.actor.displayName,
        memberName: placeholder.displayName,
      },
    });

    return { displayName: placeholder.displayName };
  });
}
