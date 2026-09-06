import { describe, expect, it } from "vitest";
import {
  assertAllowedMemberIds,
  calculateItemizedExpense,
  inferItemizedAdjustments,
  tipCentsFromPercent,
  type ItemizedExpenseInput,
} from "./itemized-expense";

function receipt(
  overrides: Partial<ItemizedExpenseInput> = {},
): ItemizedExpenseInput {
  return {
    taxCents: 0,
    tipCents: 0,
    items: [
      {
        description: "Dinner",
        amountCents: 1000,
        quantity: 1,
        memberIds: ["a"],
      },
    ],
    ...overrides,
  };
}

describe("calculateItemizedExpense", () => {
  it("divides shared lines equally with deterministic cent rounding", () => {
    const result = calculateItemizedExpense(
      receipt({
        items: [
          {
            description: "Shared appetizer",
            amountCents: 101,
            quantity: 1,
            memberIds: ["a", "b"],
          },
          {
            description: "Drink",
            amountCents: 50,
            quantity: 1,
            memberIds: ["b"],
          },
        ],
      }),
    );

    expect(result.taxAndTipCents).toBe(0);
    expect(result.calculatedTotalCents).toBe(151);
    expect(result.memberItemSubtotals).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
  });

  it("multiplies unit price by quantity for line totals", () => {
    const result = calculateItemizedExpense(
      receipt({
        taxCents: 729,
        items: [
          {
            description: "Scallops Risotto",
            amountCents: 2100,
            quantity: 2,
            memberIds: ["a"],
          },
          {
            description: "Truffle Fries",
            amountCents: 1200,
            quantity: 1,
            memberIds: ["b"],
          },
          {
            description: "Cajun Fried Oysters",
            amountCents: 1800,
            quantity: 1,
            memberIds: ["a", "b"],
          },
          {
            description: "Mushroom Risotto",
            amountCents: 1700,
            quantity: 1,
            memberIds: ["b"],
          },
          {
            description: "filet sand",
            amountCents: 2100,
            quantity: 1,
            memberIds: ["a"],
          },
        ],
      }),
    );

    expect(result.itemSubtotalCents).toBe(11000);
    expect(result.taxAndTipCents).toBe(729);
    expect(result.calculatedTotalCents).toBe(11729);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 7677, weight: 7200 },
      { memberId: "b", amountCents: 4052, weight: 3800 },
    ]);
  });

  it("allocates tax and tip residual proportionally", () => {
    const result = calculateItemizedExpense(
      receipt({
        taxCents: 2000,
        items: [
          { description: "A", amountCents: 6000, quantity: 1, memberIds: ["a"] },
          { description: "B", amountCents: 4000, quantity: 1, memberIds: ["b"] },
        ],
      }),
    );

    expect(result.itemSubtotalCents).toBe(10000);
    expect(result.taxCents).toBe(2000);
    expect(result.tipCents).toBe(0);
    expect(result.taxAndTipCents).toBe(2000);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 7200, weight: 6000 },
      { memberId: "b", amountCents: 4800, weight: 4000 },
    ]);
  });

  it("allocates an added tip pro-rata by item share", () => {
    // Wonton Guy-style: items 64.75 + tax 4.30, then 18% tip on items.
    const result = calculateItemizedExpense(
      receipt({
        taxCents: 430,
        tipCents: 1166,
        items: [
          {
            description: "Two Toppings w. Noodle in Soup",
            amountCents: 1375,
            quantity: 1,
            memberIds: ["vince"],
          },
          {
            description: "Two Toppings in Soup",
            amountCents: 1475,
            quantity: 1,
            memberIds: ["vince"],
          },
          {
            description: "Two Toppings w. Noodle in Soup",
            amountCents: 1375,
            quantity: 1,
            memberIds: ["allison"],
          },
          {
            description: "Three Toppings w. Noodle in Soup",
            amountCents: 1550,
            quantity: 1,
            memberIds: ["allison"],
          },
          {
            description: "Choy Sum",
            amountCents: 700,
            quantity: 1,
            memberIds: ["vince", "allison"],
          },
        ],
      }),
    );

    expect(result.itemSubtotalCents).toBe(6475);
    expect(result.calculatedTotalCents).toBe(8071);
    const vinceItems = 1375 + 1475 + 350;
    const allisonItems = 1375 + 1550 + 350;
    expect(result.memberItemSubtotals).toEqual([
      { memberId: "vince", amountCents: vinceItems, weight: vinceItems },
      { memberId: "allison", amountCents: allisonItems, weight: allisonItems },
    ]);
    expect(result.splits.reduce((sum, split) => sum + split.amountCents, 0)).toBe(
      8071,
    );
    const vince = result.splits.find((split) => split.memberId === "vince");
    const allison = result.splits.find((split) => split.memberId === "allison");
    expect(vince?.weight).toBe(vinceItems);
    expect(allison?.weight).toBe(allisonItems);
    expect(Math.abs((vince?.amountCents ?? 0) / vinceItems - 8071 / 6475)).toBeLessThan(
      0.001,
    );
  });

  it("allows a zero tax and tip residual", () => {
    const result = calculateItemizedExpense(receipt());
    expect(result.taxAndTipCents).toBe(0);
    expect(result.calculatedTotalCents).toBe(1000);
  });

  it.each([
    ["an empty receipt", receipt({ items: [] }), /at least one/i],
    [
      "a zero-price line",
      receipt({
        items: [
          {
            description: "Free",
            amountCents: 0,
            quantity: 1,
            memberIds: ["a"],
          },
        ],
      }),
      /greater than zero/i,
    ],
    [
      "a zero quantity",
      receipt({
        items: [
          {
            description: "Dinner",
            amountCents: 1000,
            quantity: 0,
            memberIds: ["a"],
          },
        ],
      }),
      /quantity/i,
    ],
    [
      "an unassigned line",
      receipt({
        items: [
          {
            description: "Dinner",
            amountCents: 1000,
            quantity: 1,
            memberIds: [],
          },
        ],
      }),
      /assign/i,
    ],
    [
      "duplicate participants",
      receipt({
        items: [
          {
            description: "Dinner",
            amountCents: 1000,
            quantity: 1,
            memberIds: ["a", "a"],
          },
        ],
      }),
      /duplicate/i,
    ],
    ["a negative tax", receipt({ taxCents: -1 }), /tax/i],
    ["a negative tip", receipt({ tipCents: -1 }), /tip/i],
  ])("rejects %s", (_name, input, message) => {
    expect(() => calculateItemizedExpense(input)).toThrow(message);
  });
});

describe("inferItemizedAdjustments", () => {
  it("treats leftover printed total as tax when Gemini omitted tax", () => {
    expect(
      inferItemizedAdjustments({
        itemSubtotalCents: 6475,
        printedTotalCents: 6905,
      }),
    ).toEqual({ taxCents: 430, tipCents: 0 });
  });

  it("prefills parsed tax and folds 1-cent rounding into tax", () => {
    expect(
      inferItemizedAdjustments({
        itemSubtotalCents: 6475,
        printedTotalCents: 6905,
        parsedTaxCents: 429,
      }),
    ).toEqual({ taxCents: 430, tipCents: 0 });
  });

  it("leaves tip at 0 unless parsed, even when leftover exists", () => {
    expect(
      inferItemizedAdjustments({
        itemSubtotalCents: 6475,
        printedTotalCents: 6905,
        parsedTipCents: 0,
      }),
    ).toEqual({ taxCents: 430, tipCents: 0 });
  });

  it("keeps an explicit parsed tip and does not fold it into tax", () => {
    expect(
      inferItemizedAdjustments({
        itemSubtotalCents: 10000,
        printedTotalCents: 12300,
        parsedTaxCents: 800,
        parsedTipCents: 1500,
      }),
    ).toEqual({ taxCents: 800, tipCents: 1500 });
  });
});

describe("tipCentsFromPercent", () => {
  it("rounds 18% of the Wonton Guy items subtotal", () => {
    expect(tipCentsFromPercent(6475, 18)).toBe(1166);
    expect(tipCentsFromPercent(6475, 15)).toBe(971);
    expect(tipCentsFromPercent(6475, 20)).toBe(1295);
  });
});

describe("assertAllowedMemberIds", () => {
  it("accepts group members and rejects foreign members", () => {
    expect(() =>
      assertAllowedMemberIds(["a", "b"], new Set(["a", "b"])),
    ).not.toThrow();
    expect(() =>
      assertAllowedMemberIds(["a", "outside"], new Set(["a", "b"])),
    ).toThrow(/belong to this group/);
  });
});
