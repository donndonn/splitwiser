import { describe, expect, it } from "vitest";
import {
  draftToExpenseDefaults,
  expenseDraftSchema,
  matchMemberName,
  type ExpenseDraft,
} from "./parse-expense-text";

const roster = [
  { id: "m1", displayName: "Vince" },
  { id: "m2", displayName: "Alex" },
  { id: "m3", displayName: "Bob" },
  { id: "m4", displayName: "Sam" },
];

describe("matchMemberName", () => {
  it("matches exact names case-insensitively", () => {
    expect(matchMemberName("vince", roster)).toBe("m1");
    expect(matchMemberName("Alex", roster)).toBe("m2");
  });

  it("matches me/I to the current member", () => {
    expect(matchMemberName("me", roster, "m1")).toBe("m1");
    expect(matchMemberName("I", roster, "m1")).toBe("m1");
  });

  it("returns null when ambiguous or unknown", () => {
    expect(matchMemberName("nobody", roster)).toBeNull();
  });
});

describe("draftToExpenseDefaults", () => {
  const simpleDraft: ExpenseDraft = {
    entryMode: "simple",
    description: "Lunch",
    amount: 45.5,
    spentAt: "2026-07-27",
    notes: null,
    splitMode: "equal",
    paidByName: "Vince",
    participants: [
      { name: "Vince", weight: null },
      { name: "Alex", weight: null },
    ],
    items: [],
  };

  it("maps simple amount, payer, and included members", () => {
    const defaults = draftToExpenseDefaults(simpleDraft, roster, "m1");
    expect(defaults).toMatchObject({
      entryMode: "simple",
      description: "Lunch",
      amount: "45.50",
      paidByMemberId: "m1",
      spentAt: "2026-07-27",
      splitMode: "equal",
      included: ["m1", "m2"],
    });
  });

  it("falls back to default payer and full roster when names missing", () => {
    const defaults = draftToExpenseDefaults(
      {
        ...simpleDraft,
        paidByName: null,
        participants: [],
      },
      roster,
      "m3",
    );
    expect(defaults.entryMode).toBe("simple");
    if (defaults.entryMode !== "simple") return;
    expect(defaults.paidByMemberId).toBe("m3");
    expect(defaults.included).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("stores exact-mode weights in cents", () => {
    const defaults = draftToExpenseDefaults(
      {
        ...simpleDraft,
        amount: 30,
        splitMode: "exact",
        participants: [
          { name: "Vince", weight: 20.5 },
          { name: "Bob", weight: 9.5 },
        ],
      },
      roster,
      "m1",
    );
    expect(defaults.entryMode).toBe("simple");
    if (defaults.entryMode !== "simple") return;
    expect(defaults.weights).toEqual({ m1: 2050, m3: 950 });
  });

  it("maps receipt-style text to itemized defaults without inventing people", () => {
    const defaults = draftToExpenseDefaults(
      {
        entryMode: "itemized",
        description: "Lunch",
        amount: 100,
        spentAt: null,
        notes: null,
        splitMode: "equal",
        paidByName: null,
        participants: [],
        items: [
          {
            description: "Cheeseburger",
            amount: 25,
            quantity: 1,
            assigneeNames: ["me"],
          },
          {
            description: "Caesar salad",
            amount: 26,
            quantity: null,
            assigneeNames: ["Alex"],
          },
          {
            description: "Scallop pasta",
            amount: 27,
            quantity: 1,
            assigneeNames: ["Bob"],
          },
        ],
      },
      roster,
      "m1",
    );

    expect(defaults).toEqual({
      entryMode: "itemized",
      description: "Lunch",
      amount: "100.00",
      paidByMemberId: "m1",
      spentAt: expect.any(String),
      notes: undefined,
      tax: "22.00",
      tip: "0.00",
      items: [
        {
          description: "Cheeseburger",
          amount: "25.00",
          quantity: 1,
          memberIds: ["m1"],
        },
        {
          description: "Caesar salad",
          amount: "26.00",
          quantity: 1,
          memberIds: ["m2"],
        },
        {
          description: "Scallop pasta",
          amount: "27.00",
          quantity: 1,
          memberIds: ["m3"],
        },
      ],
    });
  });
});

describe("expenseDraftSchema", () => {
  it("rejects non-positive amounts", () => {
    expect(() =>
      expenseDraftSchema.parse({
        entryMode: "simple",
        description: "x",
        amount: 0,
        spentAt: null,
        notes: null,
        splitMode: "equal",
        paidByName: null,
        participants: [],
        items: [],
      }),
    ).toThrow();
  });
});
