import { describe, expect, it } from "vitest";
import { resolveAddExpenseEntry } from "./add-expense-entry";

const cabin = { id: "g1", name: "Cabin" };
const dinner = { id: "g2", name: "Dinner" };

describe("resolveAddExpenseEntry", () => {
  it("asks for a group when the user has none", () => {
    expect(resolveAddExpenseEntry([])).toEqual({ type: "empty" });
  });

  it("opens that group's expense form when there is only one", () => {
    expect(resolveAddExpenseEntry([cabin])).toEqual({
      type: "direct",
      groupId: "g1",
    });
  });

  it("asks which group when there are several", () => {
    expect(resolveAddExpenseEntry([cabin, dinner])).toEqual({ type: "picker" });
  });
});
