import { describe, expect, it } from "vitest";
import {
  normalizeReceiptItems,
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
    expect(defaults.tax).toBe("27.25");
    expect(defaults.tip).toBe("0.00");
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

  it("prefills tax from leftover printed total and leaves unpaid tip at 0", () => {
    const defaults = receiptToExpenseDefaults(
      {
        merchant: "Wonton Guy",
        amount: 69.05,
        spentAt: "2026-09-06",
        tax: 4.29,
        items: [
          { description: "Two Toppings w. Noodle in Soup", amount: 13.75, quantity: 1 },
          { description: "Two Toppings in Soup", amount: 14.75, quantity: 1 },
          { description: "Two Toppings w. Noodle in Soup", amount: 13.75, quantity: 1 },
          { description: "Three Toppings w. Noodle in Soup", amount: 15.5, quantity: 1 },
          { description: "Choy Sum", amount: 7, quantity: 1 },
        ],
      },
      "assign",
      roster,
      "m1",
    );
    expect(defaults.entryMode).toBe("itemized");
    if (defaults.entryMode !== "itemized") return;
    expect(defaults.amount).toBe("69.05");
    expect(defaults.tax).toBe("4.30");
    expect(defaults.tip).toBe("0.00");
    expect(defaults.items).toHaveLength(5);
  });
});

describe("normalizeReceiptItems", () => {
  const oriana = {
    merchant: "Oriana",
    amount: 882.43,
    spentAt: "2026-09-25",
    subtotal: 810.5,
    tax: 71.93,
    items: [
      { description: "Smoking Sol", lineTotal: 22, quantity: 1 },
      { description: "Ghost Flame", lineTotal: 36, quantity: 2 },
      { description: "Grilled Bread", lineTotal: 28, quantity: 2 },
      { description: "Scallop", lineTotal: 66, quantity: 2 },
      { description: "Bluefin Tuna", lineTotal: 28, quantity: 1 },
      { description: "Coffee & Donut", lineTotal: 54, quantity: 3 },
    ],
  };

  it("divides a printed line total by its quantity", () => {
    const items = normalizeReceiptItems(oriana);
    expect(items[1]).toEqual({
      description: "Ghost Flame",
      amount: 18,
      quantity: 2,
    });
    expect(items[5]).toEqual({
      description: "Coffee & Donut",
      amount: 18,
      quantity: 3,
    });
  });

  it("keeps quantity 1 lines as printed", () => {
    expect(normalizeReceiptItems(oriana)[0]).toEqual({
      description: "Smoking Sol",
      amount: 22,
      quantity: 1,
    });
  });

  it("treats a null quantity as 1", () => {
    expect(
      normalizeReceiptItems({
        ...oriana,
        subtotal: null,
        items: [{ description: "Soup", lineTotal: 8, quantity: null }],
      }),
    ).toEqual([{ description: "Soup", amount: 8, quantity: 1 }]);
  });

  it("splits a line total that doesn't divide evenly into two rows", () => {
    const items = normalizeReceiptItems({
      ...oriana,
      subtotal: null,
      items: [{ description: "Taco", lineTotal: 10, quantity: 3 }],
    });
    expect(items).toEqual([
      { description: "Taco", amount: 3.33, quantity: 2 },
      { description: "Taco", amount: 3.34, quantity: 1 },
    ]);
  });

  it("reads prices as unit prices when that is what matches the subtotal", () => {
    const items = normalizeReceiptItems({
      ...oriana,
      subtotal: 47,
      items: [
        { description: "Latte", lineTotal: 5.5, quantity: 2 },
        { description: "Pasta", lineTotal: 18, quantity: 2 },
      ],
    });
    expect(items).toEqual([
      { description: "Latte", amount: 5.5, quantity: 2 },
      { description: "Pasta", amount: 18, quantity: 2 },
    ]);
  });

  it("gives an itemized subtotal equal to the printed subtotal", () => {
    const receipt = { ...oriana, amount: 305.93, subtotal: 234 };
    const defaults = receiptToExpenseDefaults(
      { ...receipt, items: normalizeReceiptItems(receipt) },
      "assign",
      roster,
      "m1",
    );
    if (defaults.entryMode !== "itemized") throw new Error("expected itemized");
    expect(defaults.tax).toBe("71.93");
    expect(defaults.amount).toBe("305.93");
  });
});
