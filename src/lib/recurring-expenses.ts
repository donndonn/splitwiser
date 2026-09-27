import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  expenseItemAssignments,
  expenseItems,
  expenseSplits,
  expenses,
  recurringExpenses,
  type RecurringExpense,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { logGroupActivity } from "@/lib/activity";
import {
  dueOccurrences,
  occurrenceDate,
  type RepeatChoice,
} from "@/lib/recurrence";

/**
 * Start, change, or stop the schedule whose template is `expenseId`. Keeps the
 * existing schedule when neither the frequency nor this occurrence's date
 * changed; otherwise restarts it from the expense's date.
 */
export async function setExpenseRecurrence(
  client: DbOrTx,
  input: {
    groupId: string;
    expenseId: string;
    spentAt: Date;
    repeat: RepeatChoice;
    actorMemberId: string;
  },
): Promise<void> {
  const [existing] = await client
    .select()
    .from(recurringExpenses)
    .where(eq(recurringExpenses.sourceExpenseId, input.expenseId))
    .limit(1);

  if (input.repeat === "never") {
    if (existing) {
      await client
        .delete(recurringExpenses)
        .where(eq(recurringExpenses.id, existing.id));
    }
    return;
  }

  if (existing) {
    const currentDate = occurrenceDate(
      existing.startsAt,
      existing.frequency,
      existing.occurrenceCount - 1,
    );
    if (
      existing.frequency === input.repeat &&
      currentDate.getTime() === input.spentAt.getTime()
    ) {
      return;
    }
    await client
      .update(recurringExpenses)
      .set({
        frequency: input.repeat,
        startsAt: input.spentAt,
        occurrenceCount: 1,
        nextOccurrenceAt: occurrenceDate(input.spentAt, input.repeat, 1),
      })
      .where(eq(recurringExpenses.id, existing.id));
    return;
  }

  await client.insert(recurringExpenses).values({
    groupId: input.groupId,
    sourceExpenseId: input.expenseId,
    frequency: input.repeat,
    startsAt: input.spentAt,
    occurrenceCount: 1,
    nextOccurrenceAt: occurrenceDate(input.spentAt, input.repeat, 1),
    createdByMemberId: input.actorMemberId,
  });
}

export async function getExpenseRecurrence(
  client: DbOrTx,
  expenseId: string,
): Promise<RecurringExpense | null> {
  const [row] = await client
    .select()
    .from(recurringExpenses)
    .where(eq(recurringExpenses.sourceExpenseId, expenseId))
    .limit(1);
  return row ?? null;
}

/** Copy an expense with its splits and items (not its receipt) to a new date. */
async function copyExpense(
  client: DbOrTx,
  sourceId: string,
  spentAt: Date,
): Promise<{
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
}> {
  const [source] = await client
    .select()
    .from(expenses)
    .where(eq(expenses.id, sourceId))
    .limit(1);
  if (!source) throw new Error("Recurring expense template not found");

  const [splits, items] = await Promise.all([
    client
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, sourceId)),
    client
      .select()
      .from(expenseItems)
      .where(eq(expenseItems.expenseId, sourceId))
      .orderBy(asc(expenseItems.sortOrder)),
  ]);
  const assignments =
    items.length === 0
      ? []
      : await client
          .select()
          .from(expenseItemAssignments)
          .where(
            inArray(
              expenseItemAssignments.expenseItemId,
              items.map((item) => item.id),
            ),
          );

  const id = crypto.randomUUID();
  await client.insert(expenses).values({
    id,
    groupId: source.groupId,
    description: source.description,
    amountCents: source.amountCents,
    paidByMemberId: source.paidByMemberId,
    spentAt,
    entryMode: source.entryMode,
    splitMode: source.splitMode,
    taxCents: source.taxCents,
    tipCents: source.tipCents,
    feeCents: source.feeCents,
    discountCents: source.discountCents,
    notes: source.notes,
    createdByMemberId: source.createdByMemberId,
  });

  if (splits.length > 0) {
    await client.insert(expenseSplits).values(
      splits.map((split) => ({
        expenseId: id,
        memberId: split.memberId,
        amountCents: split.amountCents,
        weight: split.weight,
      })),
    );
  }

  for (const item of items) {
    const itemId = crypto.randomUUID();
    await client.insert(expenseItems).values({
      id: itemId,
      expenseId: id,
      description: item.description,
      amountCents: item.amountCents,
      quantity: item.quantity,
      sortOrder: item.sortOrder,
    });
    const memberIds = assignments
      .filter((assignment) => assignment.expenseItemId === item.id)
      .map((assignment) => assignment.memberId);
    if (memberIds.length > 0) {
      await client
        .insert(expenseItemAssignments)
        .values(
          memberIds.map((memberId) => ({ expenseItemId: itemId, memberId })),
        );
    }
  }

  return {
    id,
    groupId: source.groupId,
    description: source.description,
    amountCents: source.amountCents,
  };
}

/**
 * Create every occurrence that is due. Each schedule runs in its own
 * transaction and is row-locked (skipping ones another run holds), so
 * overlapping runs never create the same occurrence twice.
 */
export async function generateDueRecurringExpenses(
  client: Db,
  now: Date = new Date(),
): Promise<{ created: number; groupIds: string[]; failed: number }> {
  const due = await client
    .select({ id: recurringExpenses.id })
    .from(recurringExpenses)
    .where(lte(recurringExpenses.nextOccurrenceAt, now))
    .orderBy(asc(recurringExpenses.nextOccurrenceAt));

  let created = 0;
  let failed = 0;
  const groupIds = new Set<string>();

  for (const { id } of due) {
    try {
      const count = await client.transaction(async (tx) => {
        const [schedule] = await tx
          .select()
          .from(recurringExpenses)
          .where(
            and(
              eq(recurringExpenses.id, id),
              lte(recurringExpenses.nextOccurrenceAt, now),
            ),
          )
          .limit(1)
          .for("update", { skipLocked: true });
        if (!schedule) return 0;

        const occurrences = dueOccurrences({
          startsAt: schedule.startsAt,
          frequency: schedule.frequency,
          occurrenceCount: schedule.occurrenceCount,
          now,
        });
        if (occurrences.length === 0) return 0;

        let sourceId = schedule.sourceExpenseId;
        for (const occurrence of occurrences) {
          const copy = await copyExpense(tx, sourceId, occurrence.date);
          await logGroupActivity(tx, {
            groupId: copy.groupId,
            type: "recurring_expense_created",
            actorMemberId: null,
            expenseId: copy.id,
            payload: {
              actorName: "",
              description: copy.description,
              amountCents: copy.amountCents,
            },
          });
          sourceId = copy.id;
        }

        const nextIndex = occurrences[occurrences.length - 1].index + 1;
        await tx
          .update(recurringExpenses)
          .set({
            sourceExpenseId: sourceId,
            occurrenceCount: nextIndex,
            nextOccurrenceAt: occurrenceDate(
              schedule.startsAt,
              schedule.frequency,
              nextIndex,
            ),
          })
          .where(eq(recurringExpenses.id, schedule.id));
        groupIds.add(schedule.groupId);
        return occurrences.length;
      });
      created += count;
    } catch (err) {
      failed += 1;
      console.error("Failed to create recurring expense", id, err);
    }
  }

  return { created, groupIds: [...groupIds], failed };
}
