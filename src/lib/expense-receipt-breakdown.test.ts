import { describe, expect, it } from "vitest";
import {
  buildItemizedReceiptBreakdown,
  buildSimpleReceiptBreakdown,
  itemizedSplitCaption,
} from "./expense-receipt-breakdown";

describe("expense-receipt-breakdown", () => {
  it("captions itemized tax/tip sharing", () => {
    expect(itemizedSplitCaption(0, 0)).toBe("Split by item");
    expect(itemizedSplitCaption(100, 0)).toBe(
      "Split by item, with tax and tip shared by item totals",
    );
  });

  it("builds an itemized receipt from stored lines", () => {
    const breakdown = buildItemizedReceiptBreakdown({
      currency: "USD",
      taxCents: 200,
      tipCents: 300,
      memberNames: new Map([
        ["a", "Vince"],
        ["b", "Allison"],
      ]),
      items: [
        {
          description: "Pancakes",
          amountCents: 1000,
          quantity: 1,
          memberIds: ["a"],
          sharedByNames: ["Vince"],
        },
        {
          description: "Omelette",
          amountCents: 1200,
          quantity: 1,
          memberIds: ["b"],
          sharedByNames: ["Allison"],
        },
      ],
    });

    expect(breakdown.kind).toBe("itemized");
    expect(breakdown.lines).toHaveLength(2);
    expect(breakdown.itemSubtotalLabel).toBe("$22.00");
    expect(breakdown.adjustments.map((row) => row.label)).toEqual([
      "Tax",
      "Tip",
    ]);
    expect(breakdown.totalLabel).toBe("$27.00");
    expect(breakdown.personRollups.map((row) => row.displayName)).toEqual([
      "Vince",
      "Allison",
    ]);
    const vince = breakdown.personRollups.find((row) => row.memberId === "a");
    const allison = breakdown.personRollups.find((row) => row.memberId === "b");
    expect(vince?.itemsLabel).toBe("$10.00");
    expect(allison?.itemsLabel).toBe("$12.00");
    expect(vince?.totalLabel).toBe("$12.27");
    expect(allison?.totalLabel).toBe("$14.73");
  });

  it("explains equal splits without inventing line items", () => {
    const breakdown = buildSimpleReceiptBreakdown({
      currency: "USD",
      amountCents: 1000,
      splitMode: "equal",
      shares: [
        {
          memberId: "a",
          displayName: "Vince",
          amountCents: 334,
          weight: 1,
        },
        {
          memberId: "b",
          displayName: "Allison",
          amountCents: 333,
          weight: 1,
        },
        {
          memberId: "c",
          displayName: "Anne",
          amountCents: 333,
          weight: 1,
        },
      ],
    });

    expect(breakdown.kind).toBe("simple");
    expect(breakdown.caption).toBe("Split equally");
    expect(breakdown.totalLabel).toBe("$10.00");
    expect(breakdown.explanation).toContain("÷ 3 people");
    expect(breakdown.shares).toHaveLength(3);
  });
});
