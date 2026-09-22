import {
  calculateItemizedExpense,
  lineTotalCents,
  type ItemizedExpenseItemInput,
} from "@/lib/itemized-expense";
import { formatMoney, type SplitMode } from "@/lib/money";

export type ExpenseReceiptLine = {
  description: string;
  quantity: number;
  unitAmountLabel: string;
  lineTotalLabel: string;
  sharedByNames: string[];
};

export type ExpenseReceiptAdjustment = {
  label: string;
  amountLabel: string;
  note: string;
};

export type ExpenseReceiptPersonRollup = {
  memberId: string;
  displayName: string;
  itemsLabel: string;
  totalLabel: string;
};

export type ItemizedReceiptBreakdown = {
  kind: "itemized";
  caption: string;
  lines: ExpenseReceiptLine[];
  itemSubtotalLabel: string;
  adjustments: ExpenseReceiptAdjustment[];
  totalLabel: string;
  allocationNote: string;
  personRollups: ExpenseReceiptPersonRollup[];
};

export type SimpleReceiptBreakdown = {
  kind: "simple";
  caption: string;
  explanation: string;
  totalLabel: string;
  shares: Array<{
    memberId: string;
    displayName: string;
    amountLabel: string;
    detail?: string;
  }>;
};

export type ExpenseReceiptBreakdown =
  | ItemizedReceiptBreakdown
  | SimpleReceiptBreakdown;

const SIMPLE_CAPTIONS: Record<SplitMode, string> = {
  equal: "Split equally",
  exact: "Split by exact amounts",
  percent: "Split by percentage",
  shares: "Split by shares",
};

const SIMPLE_EXPLANATIONS: Record<SplitMode, string> = {
  equal: "Total divided evenly among everyone on this expense.",
  exact: "Each person owes the exact amount entered for them.",
  percent: "Total allocated by each person’s percentage.",
  shares: "Total allocated by each person’s share weight.",
};

export function itemizedSplitCaption(taxCents: number, tipCents: number) {
  return taxCents > 0 || tipCents > 0
    ? "Split by item, with tax and tip shared by item totals"
    : "Split by item";
}

export function buildItemizedReceiptBreakdown(input: {
  currency: string;
  taxCents: number;
  tipCents: number;
  items: Array<
    ItemizedExpenseItemInput & {
      sharedByNames: string[];
    }
  >;
  memberNames: Map<string, string>;
  /** Final owed amounts from expense_splits — preferred for rollup totals. */
  storedSplits?: Array<{ memberId: string; amountCents: number }>;
}): ItemizedReceiptBreakdown {
  const calculation = calculateItemizedExpense({
    items: input.items,
    taxCents: input.taxCents,
    tipCents: input.tipCents,
  });

  const money = (cents: number) => formatMoney(cents, input.currency);
  const adjustments: ExpenseReceiptAdjustment[] = [];
  if (input.taxCents > 0) {
    adjustments.push({
      label: "Tax",
      amountLabel: money(input.taxCents),
      note: "Shared by item totals",
    });
  }
  if (input.tipCents > 0) {
    adjustments.push({
      label: "Tip",
      amountLabel: money(input.tipCents),
      note: "Shared by item totals",
    });
  }

  const itemSubtotalByMember = new Map(
    calculation.memberItemSubtotals.map((row) => [
      row.memberId,
      row.amountCents,
    ]),
  );

  const rollupSource =
    input.storedSplits && input.storedSplits.length > 0
      ? input.storedSplits
      : calculation.splits;

  return {
    kind: "itemized",
    caption: itemizedSplitCaption(input.taxCents, input.tipCents),
    lines: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unitAmountLabel: money(item.amountCents),
      lineTotalLabel: money(lineTotalCents(item.amountCents, item.quantity)),
      sharedByNames: item.sharedByNames,
    })),
    itemSubtotalLabel: money(calculation.itemSubtotalCents),
    adjustments,
    totalLabel: money(calculation.calculatedTotalCents),
    allocationNote:
      input.taxCents > 0 || input.tipCents > 0
        ? "Tax and tip are shared in proportion to each person’s item totals."
        : "Each item is split evenly among the people assigned to it.",
    personRollups: rollupSource.map((split) => ({
      memberId: split.memberId,
      displayName: input.memberNames.get(split.memberId) ?? "Someone",
      itemsLabel: money(itemSubtotalByMember.get(split.memberId) ?? 0),
      totalLabel: money(split.amountCents),
    })),
  };
}

export function buildSimpleReceiptBreakdown(input: {
  currency: string;
  amountCents: number;
  splitMode: SplitMode;
  shares: Array<{
    memberId: string;
    displayName: string;
    amountCents: number;
    weight: number;
  }>;
}): SimpleReceiptBreakdown {
  const money = (cents: number) => formatMoney(cents, input.currency);
  const people = input.shares.length;

  let explanation = SIMPLE_EXPLANATIONS[input.splitMode];
  if (input.splitMode === "equal" && people > 0) {
    const baseShareCents = Math.floor(input.amountCents / people);
    explanation = `${money(input.amountCents)} ÷ ${people} ${
      people === 1 ? "person" : "people"
    } ≈ ${money(baseShareCents)} each (cents rounded so shares sum to the total).`;
  }

  return {
    kind: "simple",
    caption: SIMPLE_CAPTIONS[input.splitMode],
    explanation,
    totalLabel: money(input.amountCents),
    shares: input.shares.map((share) => {
      let detail: string | undefined;
      if (input.splitMode === "percent") {
        detail = `${share.weight}%`;
      } else if (input.splitMode === "shares") {
        detail = `${share.weight} ${share.weight === 1 ? "share" : "shares"}`;
      }
      return {
        memberId: share.memberId,
        displayName: share.displayName,
        amountLabel: money(share.amountCents),
        detail,
      };
    }),
  };
}
