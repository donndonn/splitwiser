import { describe, expect, it } from "vitest";
import {
  formatBalanceContext,
  viewerBalanceContext,
  type ViewerBalanceContext,
} from "./balance-context";

describe("viewerBalanceContext", () => {
  it("counts people whose suggested payments come to you", () => {
    const context = viewerBalanceContext("you", [
      { memberId: "you", netCents: 50 },
      { memberId: "a", netCents: -30 },
      { memberId: "b", netCents: -20 },
    ]);
    expect(context).toEqual({
      peopleOweYou: 2,
      youOwePeople: 0,
      everyoneSettled: false,
    });
  });

  it("counts people you would pay", () => {
    const context = viewerBalanceContext("you", [
      { memberId: "you", netCents: -40 },
      { memberId: "a", netCents: 25 },
      { memberId: "b", netCents: 15 },
    ]);
    expect(context.youOwePeople).toBe(2);
    expect(context.peopleOweYou).toBe(0);
  });

  it("ignores debts between other people", () => {
    const context = viewerBalanceContext("you", [
      { memberId: "you", netCents: 0 },
      { memberId: "a", netCents: 10 },
      { memberId: "b", netCents: -10 },
    ]);
    expect(context).toEqual({
      peopleOweYou: 0,
      youOwePeople: 0,
      everyoneSettled: false,
    });
  });

  it("treats an all-zero group as settled", () => {
    expect(
      viewerBalanceContext("you", [
        { memberId: "you", netCents: 0 },
        { memberId: "a", netCents: 0 },
      ]).everyoneSettled,
    ).toBe(true);
  });
});

describe("formatBalanceContext", () => {
  it("joins both directions when each count is non-zero", () => {
    const context: ViewerBalanceContext = {
      peopleOweYou: 3,
      youOwePeople: 1,
      everyoneSettled: false,
    };
    expect(formatBalanceContext(context)).toBe(
      "3 people owe you · You owe 1 person",
    );
  });

  it("uses singular when one person owes you", () => {
    expect(
      formatBalanceContext({
        peopleOweYou: 1,
        youOwePeople: 0,
        everyoneSettled: false,
      }),
    ).toBe("1 person owes you");
  });

  it("uses plural when you owe several people", () => {
    expect(
      formatBalanceContext({
        peopleOweYou: 0,
        youOwePeople: 2,
        everyoneSettled: false,
      }),
    ).toBe("You owe 2 people");
  });

  it("distinguishes a settled group from a settled viewer", () => {
    expect(
      formatBalanceContext({
        peopleOweYou: 0,
        youOwePeople: 0,
        everyoneSettled: true,
      }),
    ).toBe("All settled");
    expect(
      formatBalanceContext({
        peopleOweYou: 0,
        youOwePeople: 0,
        everyoneSettled: false,
      }),
    ).toBe("You're settled up");
  });
});
