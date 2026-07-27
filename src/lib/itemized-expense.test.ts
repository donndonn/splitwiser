import { describe, expect, it } from "vitest";
import {
  assertAllowedMemberIds,
  calculateItemizedExpense,
  type ItemizedExpenseInput,
} from "./itemized-expense";

function receipt(
  overrides: Partial<ItemizedExpenseInput> = {},
): ItemizedExpenseInput {
  return {
    amountCents: 1000,
    taxCents: 0,
    tipCents: 0,
    feeCents: 0,
    discountCents: 0,
    items: [
      {
        description: "Dinner",
        amountCents: 1000,
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
        amountCents: 151,
        items: [
          {
            description: "Shared appetizer",
            amountCents: 101,
            memberIds: ["a", "b"],
          },
          {
            description: "Drink",
            amountCents: 50,
            memberIds: ["b"],
          },
        ],
      }),
    );

    expect(result.memberItemSubtotals).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
  });

  it("allocates positive adjustments proportionally", () => {
    const result = calculateItemizedExpense(
      receipt({
        amountCents: 12000,
        taxCents: 1000,
        tipCents: 1000,
        items: [
          { description: "A", amountCents: 6000, memberIds: ["a"] },
          { description: "B", amountCents: 4000, memberIds: ["b"] },
        ],
      }),
    );

    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 7200, weight: 6000 },
      { memberId: "b", amountCents: 4800, weight: 4000 },
    ]);
  });

  it("allocates discounts proportionally", () => {
    const result = calculateItemizedExpense(
      receipt({
        amountCents: 8000,
        discountCents: 2000,
        items: [
          { description: "A", amountCents: 7500, memberIds: ["a"] },
          { description: "B", amountCents: 2500, memberIds: ["b"] },
        ],
      }),
    );

    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 6000, weight: 7500 },
      { memberId: "b", amountCents: 2000, weight: 2500 },
    ]);
  });

  it("rejects totals that do not reconcile", () => {
    expect(() =>
      calculateItemizedExpense(receipt({ amountCents: 999 })),
    ).toThrow(/match the total/);
  });

  it.each([
    ["an empty receipt", receipt({ items: [] }), /at least one/i],
    [
      "a zero-price line",
      receipt({
        items: [{ description: "Free", amountCents: 0, memberIds: ["a"] }],
      }),
      /greater than zero/i,
    ],
    [
      "an unassigned line",
      receipt({
        items: [{ description: "Dinner", amountCents: 1000, memberIds: [] }],
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
            memberIds: ["a", "a"],
          },
        ],
      }),
      /duplicate/i,
    ],
    ["a non-positive final total", receipt({ amountCents: 0 }), /greater than zero/i],
  ])("rejects %s", (_name, input, message) => {
    expect(() => calculateItemizedExpense(input)).toThrow(message);
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
