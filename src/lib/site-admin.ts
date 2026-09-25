import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  adminActions,
  appSettings,
  expenses,
  groupActivities,
  groups,
  invites,
  members,
  users,
  type AdminActionDetails,
  type AdminActionType,
} from "@/db/schema";
import type { Db } from "@/db/types";
import {
  countInviteReservations,
  inviteStatus,
  type InviteStatus,
} from "@/lib/invites";

/**
 * Site admins are named by the ADMIN_EMAILS env var (comma-separated,
 * case-insensitive). There is no in-app way to grant the role.
 */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSiteAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}

export type SiteAdminActor = { id: string; email: string };

/** Unfinished signups older than this can be cleared from /admin. */
export const STALE_PENDING_DAYS = 7;
export const MAX_USERS_LIMIT = 100_000;
export const ADMIN_USERS_PAGE_SIZE = 50;
export const ADMIN_GROUPS_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export function stalePendingCutoff(
  now: Date = new Date(),
  days: number = STALE_PENDING_DAYS,
): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function parseMaxUsers(value: unknown): number {
  const text = typeof value === "number" ? null : String(value ?? "").trim();
  // Number("") is 0, so a blank value must not read as "pause signups".
  const n = text === null ? (value as number) : text === "" ? NaN : Number(text);
  if (!Number.isInteger(n) || n < 0 || n > MAX_USERS_LIMIT) {
    throw new Error(
      `Cap must be a whole number from 0 to ${MAX_USERS_LIMIT.toLocaleString()}`,
    );
  }
  return n;
}

async function logAdminAction(
  client: Pick<Db, "insert">,
  actor: SiteAdminActor,
  action: AdminActionType,
  details: AdminActionDetails,
  now: Date,
) {
  await client.insert(adminActions).values({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action,
    details,
    createdAt: now,
  });
}

/**
 * Set the account cap. Locks the settings row, so it serializes with
 * admissions; recreates the row if it is missing.
 */
export async function setMaxUsers(
  client: Db,
  input: { actor: SiteAdminActor; maxUsers: number; now?: Date },
): Promise<{ from: number | null; to: number; changed: boolean }> {
  const maxUsers = parseMaxUsers(input.maxUsers);
  const now = input.now ?? new Date();

  return client.transaction(async (tx) => {
    const [current] = await tx
      .select({ maxUsers: appSettings.maxUsers })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1)
      .for("update");
    const from = current?.maxUsers ?? null;
    if (from === maxUsers) return { from, to: maxUsers, changed: false };

    await tx
      .insert(appSettings)
      .values({ id: 1, maxUsers, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { maxUsers, updatedAt: now },
      });
    await logAdminAction(
      tx,
      input.actor,
      "set_max_users",
      { fromMaxUsers: from, toMaxUsers: maxUsers },
      now,
    );
    return { from, to: maxUsers, changed: true };
  });
}

/**
 * Delete unfinished signups older than the cutoff, freeing their cap slot and
 * their invitation's reserved join. An account that joins a group meanwhile
 * is no longer pending and is skipped.
 */
export async function deleteStalePendingUsers(
  client: Db,
  input: { actor: SiteAdminActor; now?: Date; olderThanDays?: number },
): Promise<string[]> {
  const now = input.now ?? new Date();
  const olderThanDays = input.olderThanDays ?? STALE_PENDING_DAYS;
  const cutoff = stalePendingCutoff(now, olderThanDays);

  return client.transaction(async (tx) => {
    const deleted = await tx
      .delete(users)
      .where(
        and(isNull(users.onboardingCompletedAt), lte(users.createdAt, cutoff)),
      )
      .returning({ id: users.id });
    const ids = deleted.map((row) => row.id);
    if (ids.length > 0) {
      await logAdminAction(
        tx,
        input.actor,
        "delete_stale_pending_users",
        { deletedUserIds: ids, olderThanDays },
        now,
      );
    }
    return ids;
  });
}

/**
 * Revoke a group's invitation link. Members who already joined stay; pending
 * signups admitted by it can no longer join through it.
 */
export async function revokeInvite(
  client: Db,
  input: { actor: SiteAdminActor; inviteId: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();

  return client.transaction(async (tx) => {
    const [revoked] = await tx
      .update(invites)
      .set({ revokedAt: now })
      .where(and(eq(invites.id, input.inviteId), isNull(invites.revokedAt)))
      .returning({ id: invites.id, groupId: invites.groupId });
    if (!revoked) return false;

    const [group] = await tx
      .select({ name: groups.name })
      .from(groups)
      .where(eq(groups.id, revoked.groupId))
      .limit(1);
    await logAdminAction(
      tx,
      input.actor,
      "revoke_invite",
      { inviteId: revoked.id, groupId: revoked.groupId, groupName: group?.name },
      now,
    );
    return true;
  });
}

export async function getAdminOverview(client: Db, now: Date = new Date()) {
  const cutoff = stalePendingCutoff(now);
  const [[counts], [settings], [groupTotals]] = await Promise.all([
    client
      .select({
        total: count(),
        pending: sql<number>`count(*) filter (where ${users.onboardingCompletedAt} is null)::int`,
        // Column comparisons map the Date for the driver; raw params do not.
        stalePending: sql<number>`count(*) filter (where ${and(isNull(users.onboardingCompletedAt), lte(users.createdAt, cutoff))})::int`,
      })
      .from(users),
    client
      .select({ maxUsers: appSettings.maxUsers })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1),
    client.select({ groups: count() }).from(groups),
  ]);
  return {
    total: counts.total,
    groups: groupTotals.groups,
    pending: counts.pending,
    stalePending: counts.stalePending,
    /** Null when the settings row is missing, which refuses all signups. */
    maxUsers: settings?.maxUsers ?? null,
  };
}

export type AdminUserStatus = "pending" | "active";

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAdminUsers(
  client: Db,
  input: { query?: string; status?: AdminUserStatus; page?: number },
) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const q = input.query?.trim();
  const pattern = q ? `%${escapeLike(q)}%` : null;

  // A joined aggregate, not a correlated subquery: Drizzle leaves columns
  // unqualified in single-table selects, so users.id would resolve to
  // members.id inside the subquery.
  const groupCounts = client
    .select({ userId: members.userId, groupCount: count().as("group_count") })
    .from(members)
    .where(isNotNull(members.userId))
    .groupBy(members.userId)
    .as("group_counts");

  const rows = await client
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      image: users.image,
      createdAt: users.createdAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      groupCount: sql<number>`coalesce(${groupCounts.groupCount}, 0)::int`,
    })
    .from(users)
    .leftJoin(groupCounts, eq(groupCounts.userId, users.id))
    .where(
      and(
        pattern
          ? or(
              ilike(users.name, pattern),
              ilike(users.email, pattern),
              ilike(users.username, pattern),
            )
          : undefined,
        input.status === "pending"
          ? isNull(users.onboardingCompletedAt)
          : input.status === "active"
            ? isNotNull(users.onboardingCompletedAt)
            : undefined,
      ),
    )
    .orderBy(sql`${users.createdAt} desc nulls last`, users.email, users.id)
    .limit(ADMIN_USERS_PAGE_SIZE + 1)
    .offset((page - 1) * ADMIN_USERS_PAGE_SIZE);

  return {
    page,
    hasNext: rows.length > ADMIN_USERS_PAGE_SIZE,
    users: rows.slice(0, ADMIN_USERS_PAGE_SIZE),
  };
}

export async function getAdminUser(client: Db, userId: string) {
  const [user] = await client
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [memberships, signupInvite] = await Promise.all([
    client
      .select({
        groupId: groups.id,
        groupName: groups.name,
        displayName: members.displayName,
        isAdmin: members.isAdmin,
        joinedAt: members.createdAt,
      })
      .from(members)
      .innerJoin(groups, eq(groups.id, members.groupId))
      .where(eq(members.userId, userId))
      .orderBy(groups.name),
    user.signupInviteId
      ? client
          .select({ groupId: groups.id, groupName: groups.name })
          .from(invites)
          .innerJoin(groups, eq(groups.id, invites.groupId))
          .where(eq(invites.id, user.signupInviteId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { user, memberships, signupInvite };
}

export type AdminInviteRow = {
  id: string;
  groupId: string;
  groupName: string;
  createdAt: Date;
  expiresAt: Date | null;
  uses: number;
  maxUses: number | null;
  reserved: number;
  status: InviteStatus;
};

/** Every group's current (non-revoked) link, including expired ones. */
export async function listCurrentInvites(
  client: Db,
  now: Date = new Date(),
): Promise<AdminInviteRow[]> {
  const rows = await client
    .select({
      id: invites.id,
      groupId: invites.groupId,
      groupName: groups.name,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      uses: invites.uses,
      maxUses: invites.maxUses,
      revokedAt: invites.revokedAt,
    })
    .from(invites)
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .where(isNull(invites.revokedAt))
    .orderBy(desc(invites.createdAt));
  if (rows.length === 0) return [];

  const reservations = await client
    .select({ inviteId: users.signupInviteId, reserved: count() })
    .from(users)
    .where(
      and(
        inArray(
          users.signupInviteId,
          rows.map((row) => row.id),
        ),
        isNull(users.onboardingCompletedAt),
      ),
    )
    .groupBy(users.signupInviteId);
  const reservedById = new Map(
    reservations.map((row) => [row.inviteId, row.reserved]),
  );

  return rows.map(({ revokedAt, ...row }) => {
    const reserved = reservedById.get(row.id) ?? 0;
    return {
      ...row,
      reserved,
      status: inviteStatus({ ...row, revokedAt }, now, reserved),
    };
  });
}

/**
 * Per-group aggregates as joined subqueries. Correlated subqueries are
 * avoided: Drizzle leaves columns unqualified in single-table selects.
 */
function groupAggregates(client: Db) {
  const memberStats = client
    .select({
      groupId: members.groupId,
      accounts: sql<number>`count(${members.userId})::int`.as("accounts"),
      placeholders:
        sql<number>`(count(*) - count(${members.userId}))::int`.as(
          "placeholders",
        ),
    })
    .from(members)
    .groupBy(members.groupId)
    .as("member_stats");
  const expenseStats = client
    .select({
      groupId: expenses.groupId,
      expenseCount: count().as("expense_count"),
      totalCents:
        sql<number>`coalesce(sum(${expenses.amountCents}), 0)::bigint`
          .mapWith(Number)
          .as("total_cents"),
    })
    .from(expenses)
    .groupBy(expenses.groupId)
    .as("expense_stats");
  const activityStats = client
    .select({
      groupId: groupActivities.groupId,
      lastActivityAt: sql<Date>`max(${groupActivities.createdAt})`
        .mapWith(groupActivities.createdAt)
        .as("last_activity_at"),
    })
    .from(groupActivities)
    .groupBy(groupActivities.groupId)
    .as("activity_stats");
  return { memberStats, expenseStats, activityStats };
}

export async function listAdminGroups(
  client: Db,
  input: { query?: string; page?: number },
) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const q = input.query?.trim();
  const { memberStats, expenseStats, activityStats } = groupAggregates(client);

  const rows = await client
    .select({
      id: groups.id,
      name: groups.name,
      currency: groups.currency,
      createdAt: groups.createdAt,
      accounts: sql<number>`coalesce(${memberStats.accounts}, 0)::int`,
      placeholders: sql<number>`coalesce(${memberStats.placeholders}, 0)::int`,
      expenseCount: sql<number>`coalesce(${expenseStats.expenseCount}, 0)::int`,
      totalCents: sql<number>`coalesce(${expenseStats.totalCents}, 0)`.mapWith(
        Number,
      ),
      lastActivityAt: activityStats.lastActivityAt,
    })
    .from(groups)
    .leftJoin(memberStats, eq(memberStats.groupId, groups.id))
    .leftJoin(expenseStats, eq(expenseStats.groupId, groups.id))
    .leftJoin(activityStats, eq(activityStats.groupId, groups.id))
    .where(q ? ilike(groups.name, `%${escapeLike(q)}%`) : undefined)
    .orderBy(desc(groups.createdAt), groups.id)
    .limit(ADMIN_GROUPS_PAGE_SIZE + 1)
    .offset((page - 1) * ADMIN_GROUPS_PAGE_SIZE);

  return {
    page,
    hasNext: rows.length > ADMIN_GROUPS_PAGE_SIZE,
    groups: rows.slice(0, ADMIN_GROUPS_PAGE_SIZE),
  };
}

export async function getAdminGroup(
  client: Db,
  groupId: string,
  now: Date = new Date(),
) {
  const [group] = await client
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) return null;

  const [roster, [expenseSummary], [activity], [invite]] = await Promise.all([
    client
      .select({
        id: members.id,
        displayName: members.displayName,
        isAdmin: members.isAdmin,
        joinedAt: members.createdAt,
        userId: members.userId,
        email: users.email,
      })
      .from(members)
      .leftJoin(users, eq(users.id, members.userId))
      .where(eq(members.groupId, groupId))
      .orderBy(desc(members.isAdmin), members.displayName),
    client
      .select({
        expenseCount: count(),
        totalCents: sql<number>`coalesce(sum(${expenses.amountCents}), 0)`.mapWith(
          Number,
        ),
        lastSpentAt: sql<Date | null>`max(${expenses.spentAt})`.mapWith(
          expenses.spentAt,
        ),
      })
      .from(expenses)
      .where(eq(expenses.groupId, groupId)),
    client
      .select({
        lastActivityAt: sql<Date | null>`max(${groupActivities.createdAt})`.mapWith(
          groupActivities.createdAt,
        ),
      })
      .from(groupActivities)
      .where(eq(groupActivities.groupId, groupId)),
    client
      .select()
      .from(invites)
      .where(and(eq(invites.groupId, groupId), isNull(invites.revokedAt)))
      .limit(1),
  ]);

  const reserved = invite ? await countInviteReservations(client, invite.id) : 0;

  return {
    group,
    members: roster,
    expenseCount: expenseSummary.expenseCount,
    totalCents: expenseSummary.totalCents,
    lastSpentAt: expenseSummary.lastSpentAt,
    lastActivityAt: activity.lastActivityAt,
    invite: invite
      ? {
          id: invite.id,
          uses: invite.uses,
          maxUses: invite.maxUses,
          expiresAt: invite.expiresAt,
          reserved,
          status: inviteStatus(invite, now, reserved),
        }
      : null,
  };
}

export async function listAdminActions(client: Db, limit = 20) {
  return client
    .select()
    .from(adminActions)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}
