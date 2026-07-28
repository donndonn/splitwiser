import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const splitModeEnum = pgEnum("split_mode", [
  "equal",
  "exact",
  "percent",
  "shares",
]);

export const expenseEntryModeEnum = pgEnum("expense_entry_mode", [
  "simple",
  "itemized",
]);

export const groupActivityTypeEnum = pgEnum("group_activity_type", [
  "expense_created",
  "expense_updated",
  "expense_deleted",
  "group_renamed",
  "settlement_recorded",
  "member_joined",
  "member_left",
]);
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    username: text("username"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
  },
  (table) => [
    uniqueIndex("users_username_unique")
      .on(sql`lower(${table.username})`)
      .where(sql`${table.username} is not null`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const groups = pgTable("groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("members_group_user_unique")
      .on(table.groupId, table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("members_group_display_name_unique").on(
      table.groupId,
      sql`lower(${table.displayName})`,
    ),
    index("members_group_id_idx").on(table.groupId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdByMemberId: text("created_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("invites_group_id_idx").on(table.groupId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paidByMemberId: text("paid_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    spentAt: timestamp("spent_at", { mode: "date" }).notNull().defaultNow(),
    entryMode: expenseEntryModeEnum("entry_mode").notNull().default("simple"),
    splitMode: splitModeEnum("split_mode").notNull().default("equal"),
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    tipCents: bigint("tip_cents", { mode: "number" }).notNull().default(0),
    feeCents: bigint("fee_cents", { mode: "number" }).notNull().default(0),
    discountCents: bigint("discount_cents", { mode: "number" })
      .notNull()
      .default(0),
    notes: text("notes"),
    createdByMemberId: text("created_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("expenses_group_id_idx").on(table.groupId),
    index("expenses_spent_at_idx").on(table.spentAt),
  ],
);

export const expenseItems = pgTable(
  "expense_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("expense_items_expense_id_idx").on(table.expenseId)],
);

export const expenseItemAssignments = pgTable(
  "expense_item_assignments",
  {
    expenseItemId: text("expense_item_id")
      .notNull()
      .references(() => expenseItems.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.expenseItemId, table.memberId] }),
    index("expense_item_assignments_member_id_idx").on(table.memberId),
  ],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    weight: numeric("weight", { precision: 12, scale: 4 }),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.memberId] }),
    index("expense_splits_member_id_idx").on(table.memberId),
  ],
);

export const settlements = pgTable(
  "settlements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: text("from_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    toMemberId: text("to_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    settledAt: timestamp("settled_at", { mode: "date" }).notNull().defaultNow(),
    note: text("note"),
    createdByMemberId: text("created_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("settlements_group_id_idx").on(table.groupId)],
);

export type GroupActivityPayload = {
  actorName: string;
  description?: string;
  amountCents?: number;
  oldName?: string;
  newName?: string;
  fromName?: string;
  toName?: string;
  memberName?: string;
};

export const groupActivities = pgTable(
  "group_activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    type: groupActivityTypeEnum("type").notNull(),
    actorMemberId: text("actor_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    /** Soft reference — no FK so deleted expenses keep their log rows. */
    expenseId: text("expense_id"),
    payload: jsonb("payload").$type<GroupActivityPayload>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("group_activities_group_created_idx").on(
      table.groupId,
      table.createdAt,
    ),
  ],
);

/** Tracks Gemini expense-parse calls for per-user rate limiting. */
export const aiParseRequests = pgTable(
  "ai_parse_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_parse_requests_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

/** Mutual friends. userIdA < userIdB lexicographically for uniqueness. */
export const friendships = pgTable(
  "friendships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userIdA: text("user_id_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userIdB: text("user_id_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friendships_pair_unique").on(table.userIdA, table.userIdB),
    index("friendships_user_a_idx").on(table.userIdA),
    index("friendships_user_b_idx").on(table.userIdB),
  ],
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friend_requests_pair_unique").on(
      table.fromUserId,
      table.toUserId,
    ),
    index("friend_requests_to_user_id_idx").on(table.toUserId),
    index("friend_requests_from_user_id_idx").on(table.fromUserId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  members: many(members),
  aiParseRequests: many(aiParseRequests),
  friendRequestsSent: many(friendRequests, { relationName: "friendRequestFrom" }),
  friendRequestsReceived: many(friendRequests, {
    relationName: "friendRequestTo",
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(members),
  invites: many(invites),
  expenses: many(expenses),
  settlements: many(settlements),
  activities: many(groupActivities),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  group: one(groups, { fields: [members.groupId], references: [groups.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
  paidExpenses: many(expenses, { relationName: "paidBy" }),
  splits: many(expenseSplits),
  itemAssignments: many(expenseItemAssignments),
  activities: many(groupActivities),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  group: one(groups, { fields: [invites.groupId], references: [groups.id] }),
  createdBy: one(members, {
    fields: [invites.createdByMemberId],
    references: [members.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  paidBy: one(members, {
    fields: [expenses.paidByMemberId],
    references: [members.id],
    relationName: "paidBy",
  }),
  createdBy: one(members, {
    fields: [expenses.createdByMemberId],
    references: [members.id],
  }),
  splits: many(expenseSplits),
  items: many(expenseItems),
}));

export const expenseItemsRelations = relations(expenseItems, ({ one, many }) => ({
  expense: one(expenses, {
    fields: [expenseItems.expenseId],
    references: [expenses.id],
  }),
  assignments: many(expenseItemAssignments),
}));

export const expenseItemAssignmentsRelations = relations(
  expenseItemAssignments,
  ({ one }) => ({
    expenseItem: one(expenseItems, {
      fields: [expenseItemAssignments.expenseItemId],
      references: [expenseItems.id],
    }),
    member: one(members, {
      fields: [expenseItemAssignments.memberId],
      references: [members.id],
    }),
  }),
);

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseSplits.expenseId],
    references: [expenses.id],
  }),
  member: one(members, {
    fields: [expenseSplits.memberId],
    references: [members.id],
  }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, {
    fields: [settlements.groupId],
    references: [groups.id],
  }),
  fromMember: one(members, {
    fields: [settlements.fromMemberId],
    references: [members.id],
    relationName: "settlementFrom",
  }),
  toMember: one(members, {
    fields: [settlements.toMemberId],
    references: [members.id],
    relationName: "settlementTo",
  }),
}));

export const groupActivitiesRelations = relations(
  groupActivities,
  ({ one }) => ({
    group: one(groups, {
      fields: [groupActivities.groupId],
      references: [groups.id],
    }),
    actor: one(members, {
      fields: [groupActivities.actorMemberId],
      references: [members.id],
    }),
  }),
);

export const aiParseRequestsRelations = relations(
  aiParseRequests,
  ({ one }) => ({
    user: one(users, {
      fields: [aiParseRequests.userId],
      references: [users.id],
    }),
  }),
);

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  userA: one(users, {
    fields: [friendships.userIdA],
    references: [users.id],
    relationName: "friendshipUserA",
  }),
  userB: one(users, {
    fields: [friendships.userIdB],
    references: [users.id],
    relationName: "friendshipUserB",
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [friendRequests.fromUserId],
    references: [users.id],
    relationName: "friendRequestFrom",
  }),
  toUser: one(users, {
    fields: [friendRequests.toUserId],
    references: [users.id],
    relationName: "friendRequestTo",
  }),
}));

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseItem = typeof expenseItems.$inferSelect;
export type ExpenseItemAssignment = typeof expenseItemAssignments.$inferSelect;
export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type GroupActivity = typeof groupActivities.$inferSelect;
export type AiParseRequest = typeof aiParseRequests.$inferSelect;
export type SplitMode = (typeof splitModeEnum.enumValues)[number];
export type ExpenseEntryMode = (typeof expenseEntryModeEnum.enumValues)[number];
export type GroupActivityType =
  (typeof groupActivityTypeEnum.enumValues)[number];
