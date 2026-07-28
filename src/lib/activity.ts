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

export function formatActivityMessage(
  type: GroupActivityType,
  payload: GroupActivityPayload,
  currency: string,
): string {
  const actor = payload.actorName || "Someone";

  switch (type) {
    case "expense_created": {
      const amount =
        payload.amountCents != null
          ? ` · ${formatMoney(payload.amountCents, currency)}`
          : "";
      return `${actor} added ${payload.description ?? "an expense"}${amount}`;
    }
    case "expense_updated":
      return `${actor} updated ${payload.description ?? "an expense"}`;
    case "expense_deleted":
      return `${actor} deleted ${payload.description ?? "an expense"}`;
    case "group_renamed":
      return `${actor} renamed the group to ${payload.newName ?? "Untitled"}`;
    case "settlement_recorded": {
      const amount =
        payload.amountCents != null
          ? ` ${formatMoney(payload.amountCents, currency)}`
          : "";
      return `${payload.fromName ?? "Someone"} paid ${payload.toName ?? "someone"}${amount}`;
    }
    case "member_joined":
      return `${payload.memberName ?? actor} joined the group`;
    case "member_left":
      return `${payload.memberName ?? actor} left the group`;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
