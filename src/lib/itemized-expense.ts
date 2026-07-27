import { allocateSplits, type SplitResult } from "@/lib/money";

export type ItemizedExpenseItemInput = {
  description: string;
  amountCents: number;
  memberIds: string[];
};

export type ItemizedExpenseInput = {
  amountCents: number;
  taxCents: number;
  tipCents: number;
  feeCents: number;
  discountCents: number;
  items: ItemizedExpenseItemInput[];
};

export type ItemizedExpenseCalculation = {
  itemSubtotalCents: number;
  calculatedTotalCents: number;
  memberItemSubtotals: SplitResult[];
  splits: SplitResult[];
};

export function assertAllowedMemberIds(
  memberIds: Iterable<string>,
  allowedMemberIds: Set<string>,
) {
  for (const memberId of memberIds) {
    if (!allowedMemberIds.has(memberId)) {
      throw new Error("Every participant must belong to this group");
    }
  }
}

export function calculateItemizedExpense(
  input: ItemizedExpenseInput,
): ItemizedExpenseCalculation {
  const {
    amountCents,
    taxCents,
    tipCents,
    feeCents,
    discountCents,
    items,
  } = input;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  for (const [label, value] of [
    ["Tax", taxCents],
    ["Tip", tipCents],
    ["Fee", feeCents],
    ["Discount", discountCents],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative amount`);
    }
  }

  if (items.length === 0) {
    throw new Error("Add at least one receipt item");
  }

  const memberItemCents = new Map<string, number>();
  let itemSubtotalCents = 0;

  for (const item of items) {
    if (!item.description.trim()) {
      throw new Error("Every receipt item needs a name");
    }
    if (!Number.isInteger(item.amountCents) || item.amountCents <= 0) {
      throw new Error("Every receipt item must be greater than zero");
    }

    const uniqueMemberIds = [...new Set(item.memberIds)].sort();
    if (uniqueMemberIds.length === 0) {
      throw new Error(`Assign "${item.description.trim()}" to at least one person`);
    }
    if (uniqueMemberIds.length !== item.memberIds.length) {
      throw new Error(`"${item.description.trim()}" has duplicate participants`);
    }

    itemSubtotalCents += item.amountCents;
    const itemSplits = allocateSplits(
      item.amountCents,
      "equal",
      uniqueMemberIds.map((memberId) => ({ memberId, weight: 1 })),
    );
    for (const split of itemSplits) {
      memberItemCents.set(
        split.memberId,
        (memberItemCents.get(split.memberId) ?? 0) + split.amountCents,
      );
    }
  }

  const calculatedTotalCents =
    itemSubtotalCents + taxCents + tipCents + feeCents - discountCents;
  if (calculatedTotalCents !== amountCents) {
    throw new Error("Receipt items and adjustments must match the total");
  }

  const memberItemSubtotals = [...memberItemCents.entries()].map(
    ([memberId, amountCents]) => ({
      memberId,
      amountCents,
      weight: amountCents,
    }),
  );
  const splits = allocateSplits(
    amountCents,
    "shares",
    memberItemSubtotals.map(({ memberId, amountCents }) => ({
      memberId,
      weight: amountCents,
    })),
  );

  return {
    itemSubtotalCents,
    calculatedTotalCents,
    memberItemSubtotals,
    splits,
  };
}
