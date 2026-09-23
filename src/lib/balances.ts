import { cache } from "react";
import { type SQL, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseSplits, expenses, groups, members, settlements } from "@/db/schema";

export type MemberBalance = {
  memberId: string;
  netCents: number;
};

export type ViewerGroupSummary = {
  groupId: string;
  groupName: string;
  currency: string;
  memberId: string;
  displayName: string;
  netCents: number;
};

type NetRow = {
  group_id: string;
  member_id: string;
  net_cents: string | number | bigint;
};

/**
 * Paid, owed, and settlement deltas for the given groups, as one statement.
 * Positive delta = money the member is owed.
 */
function netDeltaSource(expenseWhere: SQL, settlementWhere: SQL) {
  return sql`
    select ${expenses.groupId} as group_id,
           ${expenses.paidByMemberId} as member_id,
           ${expenses.amountCents} as delta
    from ${expenses}
    where ${expenseWhere}
    union all
    select ${expenses.groupId},
           ${expenseSplits.memberId},
           (0 - ${expenseSplits.amountCents})
    from ${expenseSplits}
    inner join ${expenses} on ${expenseSplits.expenseId} = ${expenses.id}
    where ${expenseWhere}
    union all
    select ${settlements.groupId},
           ${settlements.fromMemberId},
           ${settlements.amountCents}
    from ${settlements}
    where ${settlementWhere}
    union all
    select ${settlements.groupId},
           ${settlements.toMemberId},
           (0 - ${settlements.amountCents})
    from ${settlements}
    where ${settlementWhere}
  `;
}

async function queryNets(
  expenseWhere: SQL,
  settlementWhere: SQL,
): Promise<NetRow[]> {
  const rows = await db.execute<NetRow>(sql`
    select group_id, member_id, sum(delta)::bigint as net_cents
    from (${netDeltaSource(expenseWhere, settlementWhere)}) as deltas
    group by group_id, member_id
  `);
  return [...rows];
}

function toCents(value: NetRow["net_cents"]): number {
  return Number(value);
}

/** Nets for many groups in one round trip. Missing groups map to []. */
export async function getBalancesByGroup(
  groupIds: readonly string[],
): Promise<Map<string, MemberBalance[]>> {
  const grouped = new Map<string, MemberBalance[]>();
  const ids = [...new Set(groupIds)];
  for (const id of ids) grouped.set(id, []);
  if (ids.length === 0) return grouped;

  const rows = await queryNets(
    inArray(expenses.groupId, ids),
    inArray(settlements.groupId, ids),
  );
  for (const row of rows) {
    const list = grouped.get(row.group_id);
    if (!list) continue;
    list.push({
      memberId: row.member_id,
      netCents: toCents(row.net_cents),
    });
  }
  return grouped;
}

/**
 * Net balance for each member in a group:
 *   +amount paid as payer
 *   -amount owed via expense splits
 *   +amount paid out via settlements (reduces what they owe)
 *   -amount received via settlements (reduces what they're owed)
 *
 * Positive = others owe them. Negative = they owe others.
 * Deduped within a single request.
 */
export const getGroupBalances = cache(
  async (groupId: string): Promise<MemberBalance[]> => {
    const grouped = await getBalancesByGroup([groupId]);
    return grouped.get(groupId) ?? [];
  },
);

export async function getMemberNet(
  groupId: string,
  memberId: string,
): Promise<number> {
  const balances = await getGroupBalances(groupId);
  return balances.find((b) => b.memberId === memberId)?.netCents ?? 0;
}

/**
 * Home screen: the viewer's groups and their own net, in one statement.
 */
export async function listViewerGroupSummaries(
  userId: string,
): Promise<ViewerGroupSummary[]> {
  const expenseInMine = sql`${expenses.groupId} in (select group_id from mine)`;
  const settlementInMine = sql`${settlements.groupId} in (select group_id from mine)`;

  const rows = await db.execute<{
    group_id: string;
    group_name: string;
    currency: string;
    member_id: string;
    display_name: string;
    net_cents: string | number | bigint;
  }>(sql`
    with mine as (
      select ${members.id} as member_id,
             ${members.groupId} as group_id,
             ${members.displayName} as display_name,
             ${groups.name} as group_name,
             ${groups.currency} as currency
      from ${members}
      inner join ${groups} on ${groups.id} = ${members.groupId}
      where ${eq(members.userId, userId)}
    )
    select mine.group_id,
           mine.group_name,
           mine.currency,
           mine.member_id,
           mine.display_name,
           coalesce(nets.net_cents, 0)::bigint as net_cents
    from mine
    left join (
      select group_id, member_id, sum(delta)::bigint as net_cents
      from (${netDeltaSource(expenseInMine, settlementInMine)}) as deltas
      group by group_id, member_id
    ) as nets
      on nets.group_id = mine.group_id
     and nets.member_id = mine.member_id
  `);

  return [...rows].map((row) => ({
    groupId: row.group_id,
    groupName: row.group_name,
    currency: row.currency,
    memberId: row.member_id,
    displayName: row.display_name,
    netCents: toCents(row.net_cents),
  }));
}
