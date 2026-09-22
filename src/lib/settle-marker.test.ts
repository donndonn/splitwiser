import { describe, expect, it } from "vitest";
import {
  areAllBalancesZero,
  formatExpenseDateLabel,
  isDismissalActive,
  isExpenseInOpenPeriod,
  laterDate,
  shouldPromptMarkAsSettled,
} from "./settle-marker";

describe("areAllBalancesZero", () => {
  it("is true when every net is 0", () => {
    expect(
      areAllBalancesZero([{ netCents: 0 }, { netCents: 0 }]),
    ).toBe(true);
  });

  it("treats sub-cent residuals as settled", () => {
    expect(areAllBalancesZero([{ netCents: 0.4 }, { netCents: -0.4 }])).toBe(
      true,
    );
  });

  it("is false when anyone is owed a cent", () => {
    expect(
      areAllBalancesZero([{ netCents: 1 }, { netCents: -1 }]),
    ).toBe(false);
  });

  it("is true for an empty roster (no activity)", () => {
    expect(areAllBalancesZero([])).toBe(true);
  });
});

describe("isExpenseInOpenPeriod", () => {
  it("treats all expenses as open when there is no marker", () => {
    expect(isExpenseInOpenPeriod(new Date("2026-07-05T12:00:00Z"), null)).toBe(
      true,
    );
  });

  it("hides expenses created at or before the marker", () => {
    const marker = new Date("2026-09-08T21:35:00Z");
    expect(
      isExpenseInOpenPeriod(new Date("2026-09-08T21:35:00Z"), marker),
    ).toBe(false);
    expect(
      isExpenseInOpenPeriod(new Date("2026-07-05T12:00:00Z"), marker),
    ).toBe(false);
  });

  it("keeps expenses created after the marker, even earlier spentAt dates", () => {
    const marker = new Date("2026-09-08T21:35:00Z");
    expect(
      isExpenseInOpenPeriod(new Date("2026-09-08T21:35:01Z"), marker),
    ).toBe(true);
  });
});

describe("isDismissalActive", () => {
  it("is inactive without a dismissal", () => {
    expect(isDismissalActive(null, new Date("2026-09-08T12:00:00Z"))).toBe(
      false,
    );
  });

  it("stays active while the watermark has not moved", () => {
    const t = new Date("2026-09-08T12:00:00Z");
    expect(isDismissalActive({ activityWatermark: t }, t)).toBe(true);
  });

  it("clears once new expense or settlement activity lands", () => {
    expect(
      isDismissalActive(
        { activityWatermark: new Date("2026-09-08T12:00:00Z") },
        new Date("2026-09-08T13:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("shouldPromptMarkAsSettled", () => {
  it("prompts once when the group is at zero with open-period expenses", () => {
    expect(
      shouldPromptMarkAsSettled({
        fullySettled: true,
        openPeriodExpenseCount: 3,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it("does not prompt when someone still owes", () => {
    expect(
      shouldPromptMarkAsSettled({
        fullySettled: false,
        openPeriodExpenseCount: 3,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("does not prompt with nothing to archive", () => {
    expect(
      shouldPromptMarkAsSettled({
        fullySettled: true,
        openPeriodExpenseCount: 0,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("does not nag after Not now for this streak", () => {
    expect(
      shouldPromptMarkAsSettled({
        fullySettled: true,
        openPeriodExpenseCount: 3,
        dismissed: true,
      }),
    ).toBe(false);
  });
});

describe("laterDate", () => {
  it("returns the later of two timestamps", () => {
    const a = new Date("2026-07-05T00:00:00Z");
    const b = new Date("2026-09-08T00:00:00Z");
    expect(laterDate(a, b)).toBe(b);
    expect(laterDate(null, b)).toBe(b);
    expect(laterDate(a, null)).toBe(a);
    expect(laterDate(null, null)).toBeNull();
  });
});

describe("formatExpenseDateLabel", () => {
  it("formats month and day", () => {
    expect(formatExpenseDateLabel(new Date("2026-07-05T12:00:00Z"), "en-US")).toBe(
      "Jul 5",
    );
  });
});
