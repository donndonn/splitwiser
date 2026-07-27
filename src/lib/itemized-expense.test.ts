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

    expect(result.taxAndTipCents).toBe(0);
    expect(result.memberItemSubtotals).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 51, weight: 51 },
      { memberId: "b", amountCents: 100, weight: 100 },
    ]);
  });

  it("allocates tax and tip residual proportionally", () => {
    const result = calculateItemizedExpense(
      receipt({
        amountCents: 12000,
        items: [
          { description: "A", amountCents: 6000, memberIds: ["a"] },
          { description: "B", amountCents: 4000, memberIds: ["b"] },
        ],
      }),
    );

    expect(result.itemSubtotalCents).toBe(10000);
    expect(result.taxAndTipCents).toBe(2000);
    expect(result.splits).toEqual([
      { memberId: "a", amountCents: 7200, weight: 6000 },
      { memberId: "b", amountCents: 4800, weight: 4000 },
    ]);
  });

  it("allows a zero tax and tip residual", () => {
    const result = calculateItemizedExpense(receipt());
    expect(result.taxAndTipCents).toBe(0);
    expect(result.calculatedTotalCents).toBe(1000);
  });

  it("rejects when items exceed the total", () => {
    expect(() =>
      calculateItemizedExpense(receipt({ amountCents: 999 })),
    ).toThrow(/cannot exceed the total/);
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
