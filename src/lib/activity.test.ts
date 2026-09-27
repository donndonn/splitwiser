import { describe, expect, it } from "vitest";
import {
  activityText,
  describeActivity,
  type DescribeActivityInput,
} from "@/lib/activity";

const base: DescribeActivityInput = {
  kind: "expense_created",
  payload: { actorName: "Allison", description: "Wine", amountCents: 3304 },
  currency: "USD",
  actorIsViewer: false,
  viewerMemberId: "m-vince",
  viewerName: "Vince",
};

function describe_(overrides: Partial<DescribeActivityInput>) {
  const { parts, impact } = describeActivity({ ...base, ...overrides });
  return { text: activityText(parts), impact };
}

describe("describeActivity", () => {
  it("says You for the viewer and names the group on the all-groups feed", () => {
    expect(
      describe_({ actorIsViewer: true, groupName: "2025 Aspen" }).text,
    ).toBe("You added “Wine” in “2025 Aspen”");
  });

  it("shows what the viewer gets back or owes on the expense as it is now", () => {
    expect(
      describe_({
        expense: {
          amountCents: 3304,
          paidByViewer: true,
          viewerShareCents: 1652,
        },
      }).impact,
    ).toEqual({ text: "You get back $16.52", tone: "positive" });
    expect(
      describe_({
        expense: {
          amountCents: 3304,
          paidByViewer: false,
          viewerShareCents: 1652,
        },
      }).impact,
    ).toEqual({ text: "You owe $16.52", tone: "negative" });
    expect(
      describe_({
        expense: {
          amountCents: 3304,
          paidByViewer: false,
          viewerShareCents: 0,
        },
      }).impact,
    ).toEqual({ text: "You are not involved", tone: "neutral" });
  });

  it("falls back to the logged amount once the expense is gone", () => {
    expect(describe_({ expense: null }).impact).toEqual({
      text: "$33.04",
      tone: "neutral",
    });
  });

  it("says the viewer restored an expense", () => {
    expect(
      describe_({ kind: "expense_restored", actorIsViewer: true }).text,
    ).toBe("You restored “Wine”");
  });

  it("folds repeated edits into a count", () => {
    expect(describe_({ kind: "expense_updated", count: 3 }).text).toBe(
      "Allison updated “Wine” 3 times",
    );
  });

  it("spots the viewer in a payment by member id", () => {
    const result = describe_({
      kind: "settlement_recorded",
      payload: {
        actorName: "Allison",
        fromName: "Allison",
        toName: "Vince",
        fromMemberId: "m-allison",
        toMemberId: "m-vince",
        amountCents: 21914,
      },
    });
    expect(result.text).toBe("Allison paid you");
    expect(result.impact).toEqual({
      text: "You received $219.14",
      tone: "positive",
    });
  });

  it("falls back to the display name for payments logged without ids", () => {
    const result = describe_({
      kind: "settlement_recorded",
      payload: {
        actorName: "Vince",
        fromName: "vince",
        toName: "Allison",
        amountCents: 1000,
      },
    });
    expect(result.text).toBe("You paid Allison");
    expect(result.impact).toEqual({ text: "You paid $10.00", tone: "neutral" });
  });

  it("describes joins, adds, and comments", () => {
    expect(
      describe_({
        kind: "member_joined",
        payload: { actorName: "Jimmy", memberName: "Jimmy" },
      }).text,
    ).toBe("Jimmy joined the group");
    expect(
      describe_({
        kind: "member_joined",
        payload: { actorName: "Allison", memberName: "Vince" },
        groupName: "Trip",
      }).text,
    ).toBe("Allison added you to “Trip”");
    expect(describe_({ kind: "comment_added" }).text).toBe(
      "Allison commented on “Wine”",
    );
  });
});
