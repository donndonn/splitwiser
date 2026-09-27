import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  groupActivities,
  type GroupActivityPayload,
  type GroupActivityType,
} from "@/db/schema";
import { viewerExpenseShare } from "@/lib/expense-row";
import { formatMoney } from "@/lib/money";

type DbOrTx =
  | typeof db
  | PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >;

export type LogGroupActivityInput = {
  groupId: string;
  type: GroupActivityType;
  actorMemberId: string | null;
  expenseId?: string | null;
  payload: GroupActivityPayload;
};

export async function logGroupActivity(
  client: DbOrTx,
  input: LogGroupActivityInput,
) {
  await client.insert(groupActivities).values({
    groupId: input.groupId,
    type: input.type,
    actorMemberId: input.actorMemberId,
    expenseId: input.expenseId ?? null,
    payload: input.payload,
  });
}

export type ActivityKind = GroupActivityType | "comment_added";

export type ActivityTextPart = { text: string; strong?: boolean };

export type ActivityImpact = {
  text: string;
  tone: "positive" | "negative" | "neutral";
};

export type DescribeActivityInput = {
  kind: ActivityKind;
  payload: GroupActivityPayload;
  currency: string;
  actorIsViewer: boolean;
  /** The viewer's member id in this activity's group. */
  viewerMemberId: string | null;
  /**
   * The viewer's display name in this group. Only used to spot the viewer in
   * rows logged before member ids were stored in the payload.
   */
  viewerName: string | null;
  /** Set on the all-groups feed so each row says which group it is from. */
  groupName?: string | null;
  /** Consecutive identical rows folded into this one. */
  count?: number;
  /** The expense as it stands now; null once deleted. */
  expense?: {
    amountCents: number;
    paidByViewer: boolean;
    viewerShareCents: number;
  } | null;
};

export type ActivityDescription = {
  parts: ActivityTextPart[];
  impact: ActivityImpact | null;
};

function quoted(text: string | undefined, fallback: string): ActivityTextPart {
  return { text: text ? `“${text}”` : fallback, strong: Boolean(text) };
}

/**
 * Splitwise-style sentence for one activity row, from the viewer's point of
 * view: "You" for the viewer, the group named on the all-groups feed, and a
 * second line with what it means for the viewer's balance.
 */
export function describeActivity(
  input: DescribeActivityInput,
): ActivityDescription {
  const { payload, currency } = input;
  const money = (cents: number) => formatMoney(cents, currency);
  const isViewerName = (name: string | undefined) =>
    Boolean(name && input.viewerName) &&
    name!.toLowerCase() === input.viewerName!.toLowerCase();
  const person = (
    name: string | undefined,
    memberId: string | undefined,
    fallback: string,
    capital: boolean,
  ): ActivityTextPart => {
    const isViewer = memberId
      ? memberId === input.viewerMemberId
      : isViewerName(name);
    if (isViewer) return { text: capital ? "You" : "you", strong: true };
    return { text: name || fallback, strong: Boolean(name) };
  };
  const actor: ActivityTextPart = input.actorIsViewer
    ? { text: "You", strong: true }
    : { text: payload.actorName || "Someone", strong: true };
  const inGroup: ActivityTextPart[] = input.groupName
    ? [{ text: " in " }, { text: `“${input.groupName}”`, strong: true }]
    : [];
  const times: ActivityTextPart[] =
    input.count && input.count > 1 ? [{ text: ` ${input.count} times` }] : [];
  const amountImpact = (): ActivityImpact | null =>
    payload.amountCents != null
      ? { text: money(payload.amountCents), tone: "neutral" }
      : null;
  const expenseImpact = (): ActivityImpact | null => {
    if (!input.expense) return amountImpact();
    const share = viewerExpenseShare(input.expense);
    switch (share.kind) {
      case "lent":
        return {
          text: `You get back ${money(share.amountCents)}`,
          tone: "positive",
        };
      case "borrowed":
        return {
          text: `You owe ${money(share.amountCents)}`,
          tone: "negative",
        };
      case "settled":
        return {
          text: `You paid ${money(input.expense.amountCents)} for yourself`,
          tone: "neutral",
        };
      case "none":
        return { text: "You are not involved", tone: "neutral" };
    }
  };

  switch (input.kind) {
    case "expense_created":
      return {
        parts: [
          actor,
          { text: " added " },
          quoted(payload.description, "an expense"),
          ...inGroup,
        ],
        impact: expenseImpact(),
      };
    case "expense_updated":
      return {
        parts: [
          actor,
          { text: " updated " },
          quoted(payload.description, "an expense"),
          ...times,
          ...inGroup,
        ],
        impact: expenseImpact(),
      };
    case "expense_deleted":
      return {
        parts: [
          actor,
          { text: " deleted " },
          quoted(payload.description, "an expense"),
          ...inGroup,
        ],
        impact: amountImpact(),
      };
    case "comment_added":
      return {
        parts: [
          actor,
          { text: " commented on " },
          quoted(payload.description, "an expense"),
          ...inGroup,
        ],
        impact: null,
      };
    case "group_renamed":
      return {
        parts: [
          actor,
          { text: " renamed " },
          quoted(payload.oldName, "the group"),
          { text: " to " },
          quoted(payload.newName, "Untitled"),
        ],
        impact: null,
      };
    case "settlement_recorded":
    case "settlement_deleted": {
      const from = person(
        payload.fromName,
        payload.fromMemberId,
        "Someone",
        true,
      );
      const to = person(payload.toName, payload.toMemberId, "someone", false);
      const viewerIsTo = to.text === "you";
      const viewerIsFrom = from.text === "You";
      if (input.kind === "settlement_deleted") {
        return {
          parts: [
            actor,
            { text: " deleted a payment from " },
            { ...from, text: viewerIsFrom ? "you" : from.text },
            { text: " to " },
            to,
            ...inGroup,
          ],
          impact: amountImpact(),
        };
      }
      const amount = payload.amountCents;
      return {
        parts: [from, { text: " paid " }, to, ...inGroup],
        impact:
          amount == null
            ? null
            : viewerIsTo
              ? { text: `You received ${money(amount)}`, tone: "positive" }
              : viewerIsFrom
                ? { text: `You paid ${money(amount)}`, tone: "neutral" }
                : { text: money(amount), tone: "neutral" },
      };
    }
    case "member_joined":
    case "member_left": {
      const joined = input.kind === "member_joined";
      const group: ActivityTextPart = input.groupName
        ? { text: `“${input.groupName}”`, strong: true }
        : { text: "the group" };
      const selfAction =
        !payload.memberName || payload.memberName === payload.actorName;
      if (selfAction) {
        const who = input.actorIsViewer
          ? actor
          : person(
              payload.memberName ?? payload.actorName,
              undefined,
              "Someone",
              true,
            );
        return {
          parts: [who, { text: joined ? " joined " : " left " }, group],
          impact: null,
        };
      }
      return {
        parts: [
          actor,
          { text: joined ? " added " : " removed " },
          person(payload.memberName, undefined, "someone", false),
          { text: joined ? " to " : " from " },
          group,
        ],
        impact: null,
      };
    }
    default: {
      const _exhaustive: never = input.kind;
      return _exhaustive;
    }
  }
}

/** Plain-text form of {@link describeActivity}'s sentence. */
export function activityText(parts: ActivityTextPart[]): string {
  return parts.map((p) => p.text).join("");
}
