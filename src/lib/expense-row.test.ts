import { describe, expect, it } from "vitest";
import { expenseIconKind, viewerExpenseShare } from "./expense-row";

describe("viewerExpenseShare", () => {
  it("shows the viewer's split as borrowed when someone else paid", () => {
    expect(
      viewerExpenseShare({
        amountCents: 12900,
        paidByViewer: false,
        viewerShareCents: 4300,
      }),
    ).toEqual({ kind: "borrowed", amountCents: 4300 });
  });

  it("shows the amount others owe when the viewer paid", () => {
    expect(
      viewerExpenseShare({
        amountCents: 10000,
        paidByViewer: true,
        viewerShareCents: 4000,
      }),
    ).toEqual({ kind: "lent", amountCents: 6000 });
  });

  it("treats a self-only payment as settled", () => {
    expect(
      viewerExpenseShare({
        amountCents: 1800,
        paidByViewer: true,
        viewerShareCents: 1800,
      }),
    ).toEqual({ kind: "settled" });
  });

  it("hides a row the viewer neither paid nor shares", () => {
    expect(
      viewerExpenseShare({
        amountCents: 5000,
        paidByViewer: false,
        viewerShareCents: 0,
      }),
    ).toEqual({ kind: "none" });
  });

  it("lends the full total when the viewer paid and took no share", () => {
    expect(
      viewerExpenseShare({
        amountCents: 5000,
        paidByViewer: true,
        viewerShareCents: 0,
      }),
    ).toEqual({ kind: "lent", amountCents: 5000 });
  });
});

describe("expenseIconKind", () => {
  it("uses utensils for a meal and a receipt otherwise", () => {
    expect(expenseIconKind("Christmas eve dinner")).toBe("food");
    expect(expenseIconKind("The Pullman")).toBe("receipt");
    expect(expenseIconKind("coffee with Sam")).toBe("food");
  });
});