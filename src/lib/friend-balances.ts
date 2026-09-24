import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { friendships, groups, members } from "@/db/schema";
import { getBalancesByGroup } from "@/lib/balances";
import { formatMoney, suggestSettlements } from "@/lib/money";

export type CurrencyNet = {
  currency: string;
  /**
   * Positive: the friend owes the viewer.
   * Negative: the viewer owes the friend.
   */
  netCents: number;
};

export type FriendBalanceGroup = {
  currency: string;
  members: { memberId: string; userId: string | null }[];
  balances: { memberId: string; netCents: number }[];
};

export type SharedFriendGroupBalance = {
  groupId: string;
  groupName: string;
  currency: string;
  netCents: number;
};

/** Keep settled shared groups visible, even when they contribute no debt. */
export function breakdownBySharedGroup(input: {
  viewerUserId: string;
  friendUserId: string;
  groups: readonly (FriendBalanceGroup & {
    groupId: string;
    groupName: string;
  })[];
}): SharedFriendGroupBalance[] {
  return input.groups.map((group) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    currency: group.currency,
    netCents:
      aggregateFriendNets({
        viewerUserId: input.viewerUserId,
        friendUserIds: [input.friendUserId],
        groups: [group],
      }).get(input.friendUserId)?.[0]?.netCents ?? 0,
  }));
}

/**
 * Splitwise-style friend balance: simplified debts (same suggestions as
 * group Balances) between the viewer and each friend, summed across every
 * group they both belong to. Debts that simplification routes to someone
 * else do not count.
 */
export function aggregateFriendNets(input: {
  viewerUserId: string;
  friendUserIds: readonly string[];
  groups: readonly FriendBalanceGroup[];
}): Map<string, CurrencyNet[]> {
  const friends = new Set(
    input.friendUserIds.filter((id) => id !== input.viewerUserId),
  );
  const totals = new Map<string, Map<string, number>>();
  for (const friendId of friends) totals.set(friendId, new Map());

  for (const group of input.groups) {
    const userByMember = new Map<string, string>();
    let viewerMemberId: string | null = null;
    for (const member of group.members) {
      if (!member.userId) continue;
      userByMember.set(member.memberId, member.userId);
      if (member.userId === input.viewerUserId) {
        viewerMemberId = member.memberId;
      }
    }
    if (!viewerMemberId) continue;

    // Stable tie order keeps group rows and the Friends total in agreement.
    const balances = [...group.balances].sort((a, b) =>
      a.memberId.localeCompare(b.memberId),
    );
    for (const transfer of suggestSettlements(balances)) {
      if (transfer.amountCents <= 0) continue;
      const fromUser = userByMember.get(transfer.fromMemberId);
      const toUser = userByMember.get(transfer.toMemberId);
      if (!fromUser || !toUser) continue;

      let friendId: string | null = null;
      let delta = 0;
      if (fromUser === input.viewerUserId && friends.has(toUser)) {
        friendId = toUser;
        delta = -transfer.amountCents;
      } else if (toUser === input.viewerUserId && friends.has(fromUser)) {
        friendId = fromUser;
        delta = transfer.amountCents;
      }
      if (!friendId) continue;

      const byCurrency = totals.get(friendId);
      if (!byCurrency) continue;
      byCurrency.set(
        group.currency,
        (byCurrency.get(group.currency) ?? 0) + delta,
      );
    }
  }

  const result = new Map<string, CurrencyNet[]>();
  for (const [friendId, byCurrency] of totals) {
    const nets = [...byCurrency.entries()]
      .filter(([, netCents]) => netCents !== 0)
      .map(([currency, netCents]) => ({ currency, netCents }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
    result.set(friendId, nets);
  }
  return result;
}

/** Viewer-relative phrase for one currency net. Zero matches group rows. */
export function friendBalancePhrase(net: CurrencyNet): string {
  if (net.netCents > 0) {
    return `owes you ${formatMoney(net.netCents, net.currency)}`;
  }
  if (net.netCents < 0) {
    return `you owe ${formatMoney(-net.netCents, net.currency)}`;
  }
  return "settled";
}

export async function friendNetsForUsers(
  viewerUserId: string,
): Promise<Map<string, CurrencyNet[]>> {
  const pairs = await db
    .select({
      userIdA: friendships.userIdA,
      userIdB: friendships.userIdB,
    })
    .from(friendships)
    .where(
      or(
        eq(friendships.userIdA, viewerUserId),
        eq(friendships.userIdB, viewerUserId),
      ),
    );
  const uniqueFriends = [
    ...new Set(
      pairs.map((pair) =>
        pair.userIdA === viewerUserId ? pair.userIdB : pair.userIdA,
      ),
    ),
  ].filter((id) => id !== viewerUserId);
  if (uniqueFriends.length === 0) return new Map();

  const memberships = await db
    .select({
      groupId: members.groupId,
      currency: groups.currency,
    })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(eq(members.userId, viewerUserId));

  const currencyByGroup = new Map<string, string>();
  for (const row of memberships) {
    currencyByGroup.set(row.groupId, row.currency);
  }
  const groupIds = [...currencyByGroup.keys()];

  if (groupIds.length === 0) {
    return aggregateFriendNets({
      viewerUserId,
      friendUserIds: uniqueFriends,
      groups: [],
    });
  }

  const [roster, balancesByGroup] = await Promise.all([
    db
      .select({
        groupId: members.groupId,
        memberId: members.id,
        userId: members.userId,
      })
      .from(members)
      .where(inArray(members.groupId, groupIds)),
    getBalancesByGroup(groupIds),
  ]);

  const membersByGroup = new Map<
    string,
    { memberId: string; userId: string | null }[]
  >();
  for (const row of roster) {
    const list = membersByGroup.get(row.groupId) ?? [];
    list.push({ memberId: row.memberId, userId: row.userId });
    membersByGroup.set(row.groupId, list);
  }
  return aggregateFriendNets({
    viewerUserId,
    friendUserIds: uniqueFriends,
    groups: groupIds.map((groupId) => ({
      currency: currencyByGroup.get(groupId) ?? "USD",
      members: membersByGroup.get(groupId) ?? [],
      balances: balancesByGroup.get(groupId) ?? [],
    })),
  });
}

/** Shared groups in newest-first order, with the same pairwise debts as Friends. */
export async function sharedFriendGroupBalances(
  viewerUserId: string,
  friendUserId: string,
): Promise<SharedFriendGroupBalance[]> {
  const viewerMemberships = await db
    .select({ groupId: members.groupId })
    .from(members)
    .where(eq(members.userId, viewerUserId));
  const viewerGroupIds = viewerMemberships.map((row) => row.groupId);
  if (viewerGroupIds.length === 0) return [];

  const sharedGroups = await db
    .select({
      groupId: groups.id,
      groupName: groups.name,
      currency: groups.currency,
    })
    .from(members)
    .innerJoin(groups, eq(groups.id, members.groupId))
    .where(
      and(
        eq(members.userId, friendUserId),
        inArray(members.groupId, viewerGroupIds),
      ),
    )
    .orderBy(desc(groups.createdAt), desc(groups.id));
  if (sharedGroups.length === 0) return [];

  const groupIds = sharedGroups.map((group) => group.groupId);
  const [roster, balancesByGroup] = await Promise.all([
    db
      .select({
        groupId: members.groupId,
        memberId: members.id,
        userId: members.userId,
      })
      .from(members)
      .where(inArray(members.groupId, groupIds)),
    getBalancesByGroup(groupIds),
  ]);
  const membersByGroup = new Map<
    string,
    { memberId: string; userId: string | null }[]
  >();
  for (const row of roster) {
    const list = membersByGroup.get(row.groupId) ?? [];
    list.push({ memberId: row.memberId, userId: row.userId });
    membersByGroup.set(row.groupId, list);
  }

  return breakdownBySharedGroup({
    viewerUserId,
    friendUserId,
    groups: sharedGroups.map((group) => ({
      ...group,
      members: membersByGroup.get(group.groupId) ?? [],
      balances: balancesByGroup.get(group.groupId) ?? [],
    })),
  });
}
