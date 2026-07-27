import { describe, expect, it } from "vitest";
import {
  receiptDraftSchema,
  receiptToExpenseDefaults,
  type ReceiptDraft,
} from "./parse-receipt-image";

const roster = [
  { id: "m1", displayName: "Vince" },
  { id: "m2", displayName: "Alex" },
  { id: "m3", displayName: "Bob" },
];

const sampleReceipt: ReceiptDraft = {
  merchant: "Cafe Luna",
  amount: 42.5,
  spentAt: "2026-07-27",
  items: [
    { description: "Latte", amount: 5.5, quantity: 2 },
    { description: "Croissant", amount: 4.25, quantity: null },
  ],
};

describe("receiptDraftSchema", () => {
  it("accepts a valid receipt draft", () => {
    expect(receiptDraftSchema.parse(sampleReceipt)).toEqual(sampleReceipt);
  });

  it("rejects non-positive totals", () => {
    expect(() =>
      receiptDraftSchema.parse({ ...sampleReceipt, amount: 0 }),
    ).toThrow();
  });
});

describe("receiptToExpenseDefaults", () => {
  it("maps split mode to simple equal among the roster", () => {
    const defaults = receiptToExpenseDefaults(
      sampleReceipt,
      "split",
      roster,
      "m1",
    );
    expect(defaults).toMatchObject({
      entryMode: "simple",
      description: "Cafe Luna",
      amount: "42.50",
      paidByMemberId: "m1",
      spentAt: "2026-07-27",
      splitMode: "equal",
      included: ["m1", "m2", "m3"],
    });
  });

  it("maps assign mode to itemized with empty assignees", () => {
    const defaults = receiptToExpenseDefaults(
      sampleReceipt,
      "assign",
      roster,
      "m2",
    );
    expect(defaults.entryMode).toBe("itemized");
    if (defaults.entryMode !== "itemized") return;
    expect(defaults.paidByMemberId).toBe("m2");
    expect(defaults.items).toEqual([
      {
        description: "Latte",
        amount: "5.50",
        quantity: 2,
        memberIds: [],
      },
      {
        description: "Croissant",
        amount: "4.25",
        quantity: 1,
        memberIds: [],
      },
    ]);
  });

  it("falls back to simple equal when assign has no usable items", () => {
    const defaults = receiptToExpenseDefaults(
      { ...sampleReceipt, items: [] },
      "assign",
      roster,
      "m1",
    );
    expect(defaults).toMatchObject({
      entryMode: "simple",
      splitMode: "equal",
      included: ["m1", "m2", "m3"],
    });
  });

  it("uses Receipt and today when merchant/date missing", () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaults = receiptToExpenseDefaults(
      {
        merchant: null,
        amount: 10,
        spentAt: null,
        items: [],
      },
      "split",
      roster,
      "m1",
    );
    expect(defaults.description).toBe("Receipt");
    expect(defaults.spentAt).toBe(today);
  });

  it("ignores blank item descriptions", () => {
    const defaults = receiptToExpenseDefaults(
      {
        ...sampleReceipt,
        items: [
          { description: "  ", amount: 3, quantity: 1 },
          { description: "Soup", amount: 8, quantity: 1 },
        ],
      },
      "assign",
      roster,
      "m1",
    );
    expect(defaults.entryMode).toBe("itemized");
    if (defaults.entryMode !== "itemized") return;
    expect(defaults.items).toHaveLength(1);
    expect(defaults.items[0].description).toBe("Soup");
  });
});
