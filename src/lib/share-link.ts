import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  expenseSplits,
  expenses,
  groups,
  members,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { getBalancesByGroup } from "@/lib/balances";
import { activeExpense } from "@/lib/expenses";
import { suggestSettlements } from "@/lib/money";

/** How many of the newest expenses the share page lists. */
export const SHARED_EXPENSE_LIMIT = 50;

export type ShareLinkChange = "create" | "reset" | "disable";

/**
 * Turn on, replace, or turn off a group's read-only share link.
 * "create" keeps an existing token. Returns the current token, or null
 * once sharing is off.
 */
export async function changeGroupShareLink(
  client: Db,
  input: { groupId: string; change: ShareLinkChange },
): Promise<string | null> {
  return client.transaction(async (tx) => {
    const [group] = await tx
      .select({ shareToken: groups.shareToken })
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) throw new Error("Group not found");

    if (input.change === "create" && group.shareToken) {
      return group.shareToken;
    }
    const token = input.change === "disable" ? null : nanoid(24);
    await tx
      .update(groups)
      .set({ shareToken: token })
      .where(eq(groups.id, input.groupId));
    return token;
  });
}

/** The group whose sharing is on with this token, or null. */
export async function getSharedGroup(
  client: Pick<Db, "select">,
  token: string,
): Promise<{ id: string; name: string; currency: string } | null> {
  if (!token) return null;
  const [group] = await client
    .select({ id: groups.id, name: groups.name, currency: groups.currency })
    .from(groups)
    .where(eq(groups.shareToken, token))
    .limit(1);
  return group ?? null;
}

/** Receipt image for share-link viewers; the token stands in for sign-in. */
export function sharedReceiptPath(token: string, expenseId: string): string {
  return `/s/${encodeURIComponent(token)}/receipt/${encodeURIComponent(expenseId)}`;
}

export type SharedMember = {
  id: string;
  displayName: string;
  netCents: number;
};

export type SharedExpense = {
  id: string;
  description: string;
  amountCents: number;
  spentAt: Date;
  paidByMemberId: string;
  paidByName: string;
  /** Split amount per member id; members not on the expense are absent. */
  shares: Record<string, number>;
};

export type SharedGroupView = {
  group: { id: string; name: string; currency: string };
  members: SharedMember[];
  suggestions: ReturnType<typeof suggestSettlements>;
  /** Venmo handles of linked members, for pay links only. */
  venmoUsernameByMemberId: Map<string, string | null>;
  expenses: SharedExpense[];
};

/**
 * Everything the read-only share page shows, or null when the token does not
 * match a group with sharing on. Comments and emails stay out.
 */
export async function getSharedGroupView(
  client: Db,
  token: string,
): Promise<SharedGroupView | null> {
  const group = await getSharedGroup(client, token);
  if (!group) return null;

  const [roster, balancesByGroup, expenseRows] = await Promise.all([
    client
      .select({
        id: members.id,
        displayName: members.displayName,
        venmoUsername: users.venmoUsername,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.groupId, group.id))
      .orderBy(members.createdAt),
    getBalancesByGroup([group.id], client),
    client
      .select({
        id: expenses.id,
        description: expenses.description,
        amountCents: expenses.amountCents,
        spentAt: expenses.spentAt,
        paidByMemberId: expenses.paidByMemberId,
        paidByName: members.displayName,
      })
      .from(expenses)
      .innerJoin(members, eq(expenses.paidByMemberId, members.id))
      .where(and(eq(expenses.groupId, group.id), activeExpense()))
      .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
      .limit(SHARED_EXPENSE_LIMIT),
  ]);

  const splitRows =
    expenseRows.length === 0
      ? []
      : await client
          .select({
            expenseId: expenseSplits.expenseId,
            memberId: expenseSplits.memberId,
            amountCents: expenseSplits.amountCents,
          })
          .from(expenseSplits)
          .where(
            inArray(
              expenseSplits.expenseId,
              expenseRows.map((row) => row.id),
            ),
          );

  const sharesByExpense = new Map<string, Record<string, number>>();
  for (const split of splitRows) {
    const shares = sharesByExpense.get(split.expenseId) ?? {};
    shares[split.memberId] =
      (shares[split.memberId] ?? 0) + Number(split.amountCents);
    sharesByExpense.set(split.expenseId, shares);
  }

  const netById = new Map(
    (balancesByGroup.get(group.id) ?? []).map((b) => [b.memberId, b.netCents]),
  );
  const sharedMembers = roster.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    netCents: netById.get(m.id) ?? 0,
  }));

  return {
    group,
    members: sharedMembers,
    suggestions: suggestSettlements(
      sharedMembers.map((m) => ({ memberId: m.id, netCents: m.netCents })),
    ),
    venmoUsernameByMemberId: new Map(
      roster.map((m) => [m.id, m.venmoUsername ?? null]),
    ),
    expenses: expenseRows.map((row) => ({
      ...row,
      amountCents: Number(row.amountCents),
      shares: sharesByExpense.get(row.id) ?? {},
    })),
  };
}
