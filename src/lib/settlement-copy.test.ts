import { describe, expect, it } from "vitest";
import { memberLabel, paymentActionLabel } from "./settlement-copy";

describe("memberLabel", () => {
  it("returns You for the current member", () => {
    expect(memberLabel("a", "a", "Vince")).toBe("You");
    expect(memberLabel("b", "a", "Alex")).toBe("Alex");
  });
});

describe("paymentActionLabel", () => {
  it("uses pay when the current member is sending", () => {
    expect(paymentActionLabel("a", "b", "a", "Vince", "Alex")).toBe(
      "You pay Alex",
    );
  });

  it("uses pays when someone else is sending", () => {
    expect(paymentActionLabel("b", "a", "a", "Alex", "Vince")).toBe(
      "Alex pays You",
    );
    expect(paymentActionLabel("c", "d", "a", "Alex", "Sam")).toBe(
      "Alex pays Sam",
    );
  });
});
