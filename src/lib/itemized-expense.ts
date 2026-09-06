import { allocateSplits, type SplitResult } from "@/lib/money";

export type ItemizedExpenseItemInput = {
  description: string;
  amountCents: number;
  quantity: number;
  memberIds: string[];
};

export type ItemizedExpenseInput = {
  items: ItemizedExpenseItemInput[];
  taxCents: number;
  tipCents: number;
};

export type ItemizedExpenseCalculation = {
  itemSubtotalCents: number;
  taxCents: number;
  tipCents: number;
  taxAndTipCents: number;
  calculatedTotalCents: number;
  memberItemSubtotals: SplitResult[];
  splits: SplitResult[];
};

export type ItemizedAdjustmentsInput = {
  itemSubtotalCents: number;
  printedTotalCents: number;
  parsedTaxCents?: number | null;
  parsedTipCents?: number | null;
};

/**
 * Prefill tax/tip after a receipt parse (or when opening a scanned draft).
 *
 * Tip stays 0 unless Gemini (or a saved expense) provided one. Suggested
 * gratuities that are not part of the paid total must not be copied in.
 *
 * Tax prefers an explicit parsed tax line. Otherwise it is the leftover
 * printed total − items − tip — the usual post-scan gap when Gemini put
 * tax into the grand total but did not emit a tax field.
 *
 * When tip is still 0 and the printed total is a few cents above
 * items + tax, fold that remainder into tax so rounding does not look
 * like a broken receipt.
 */
export function inferItemizedAdjustments(
  input: ItemizedAdjustmentsInput,
): { taxCents: number; tipCents: number } {
  const tipCents = Math.max(0, Math.round(input.parsedTipCents ?? 0));
  let taxCents =
    input.parsedTaxCents != null
      ? Math.max(0, Math.round(input.parsedTaxCents))
      : Math.max(
          0,
          input.printedTotalCents - input.itemSubtotalCents - tipCents,
        );

  if (tipCents === 0) {
    const remainder =
      input.printedTotalCents - input.itemSubtotalCents - taxCents;
    if (remainder > 0) {
      taxCents += remainder;
    }
  }

  return { taxCents, tipCents };
}

/** Tip dollars from a percent of the items subtotal, rounded to cents. */
export function tipCentsFromPercent(
  itemSubtotalCents: number,
  percent: number,
): number {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error("Tip percent must be zero or greater");
  }
  return Math.round((itemSubtotalCents * percent) / 100);
}

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

export function lineTotalCents(amountCents: number, quantity: number) {
  return amountCents * quantity;
}

export function calculateItemizedExpense(
  input: ItemizedExpenseInput,
): ItemizedExpenseCalculation {
  const { items, taxCents, tipCents } = input;

  if (!Number.isInteger(taxCents) || taxCents < 0) {
    throw new Error("Tax must be zero or greater");
  }
  if (!Number.isInteger(tipCents) || tipCents < 0) {
    throw new Error("Tip must be zero or greater");
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
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Every receipt item needs a quantity of at least 1");
    }

    const uniqueMemberIds = [...new Set(item.memberIds)].sort();
    if (uniqueMemberIds.length === 0) {
      throw new Error(`Assign "${item.description.trim()}" to at least one person`);
    }
    if (uniqueMemberIds.length !== item.memberIds.length) {
      throw new Error(`"${item.description.trim()}" has duplicate participants`);
    }

    const itemLineTotalCents = lineTotalCents(item.amountCents, item.quantity);
    itemSubtotalCents += itemLineTotalCents;
    const itemSplits = allocateSplits(
      itemLineTotalCents,
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

  const calculatedTotalCents = itemSubtotalCents + taxCents + tipCents;
  if (calculatedTotalCents <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const memberItemSubtotals = [...memberItemCents.entries()].map(
    ([memberId, amountCents]) => ({
      memberId,
      amountCents,
      weight: amountCents,
    }),
  );

  // Shared tax and tip ride on the same weights as the food: allocate the
  // grand total (items + tax + tip) pro-rata by each person's assigned item
  // share. A person with 60% of the items owes 60% of tax and 60% of tip.
  const splits = allocateSplits(
    calculatedTotalCents,
    "shares",
    memberItemSubtotals.map(({ memberId, amountCents }) => ({
      memberId,
      weight: amountCents,
    })),
  );

  return {
    itemSubtotalCents,
    taxCents,
    tipCents,
    taxAndTipCents: taxCents + tipCents,
    calculatedTotalCents,
    memberItemSubtotals,
    splits,
  };
}
