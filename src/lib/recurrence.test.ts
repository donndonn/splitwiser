import { describe, expect, it } from "vitest";
import {
  dueOccurrences,
  occurrenceDate,
  parseRepeatChoice,
} from "./recurrence";

const noon = (date: string) => new Date(`${date}T12:00:00.000Z`);
const day = (date: Date) => date.toISOString().slice(0, 10);

describe("occurrenceDate", () => {
  it("steps weekly and every two weeks", () => {
    expect(day(occurrenceDate(noon("2026-09-27"), "weekly", 1))).toBe(
      "2026-10-04",
    );
    expect(day(occurrenceDate(noon("2026-09-27"), "biweekly", 2))).toBe(
      "2026-10-25",
    );
  });

  it("keeps a month-end anchor instead of drifting", () => {
    const start = noon("2026-01-31");
    expect(
      [1, 2, 3].map((n) => day(occurrenceDate(start, "monthly", n))),
    ).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("crosses year boundaries and handles Feb 29 yearly", () => {
    expect(day(occurrenceDate(noon("2026-11-15"), "monthly", 3))).toBe(
      "2027-02-15",
    );
    expect(day(occurrenceDate(noon("2028-02-29"), "yearly", 1))).toBe(
      "2029-02-28",
    );
    expect(day(occurrenceDate(noon("2028-02-29"), "yearly", 4))).toBe(
      "2032-02-29",
    );
  });

  it("keeps the time of day", () => {
    expect(occurrenceDate(noon("2026-01-31"), "monthly", 1).toISOString()).toBe(
      "2026-02-28T12:00:00.000Z",
    );
  });
});

describe("dueOccurrences", () => {
  it("returns nothing before the next date", () => {
    expect(
      dueOccurrences({
        startsAt: noon("2026-09-01"),
        frequency: "monthly",
        occurrenceCount: 1,
        now: noon("2026-09-30"),
      }),
    ).toEqual([]);
  });

  it("catches up every missed occurrence, including one due right now", () => {
    const due = dueOccurrences({
      startsAt: noon("2026-06-15"),
      frequency: "monthly",
      occurrenceCount: 1,
      now: noon("2026-09-15"),
    });
    expect(due.map((o) => [o.index, day(o.date)])).toEqual([
      [1, "2026-07-15"],
      [2, "2026-08-15"],
      [3, "2026-09-15"],
    ]);
  });

  it("stops at the limit", () => {
    const due = dueOccurrences({
      startsAt: noon("2020-01-01"),
      frequency: "weekly",
      occurrenceCount: 1,
      now: noon("2026-01-01"),
      limit: 5,
    });
    expect(due.map((o) => o.index)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("parseRepeatChoice", () => {
  it("defaults to never and rejects unknown values", () => {
    expect(parseRepeatChoice(null)).toBe("never");
    expect(parseRepeatChoice("")).toBe("never");
    expect(parseRepeatChoice("monthly")).toBe("monthly");
    expect(() => parseRepeatChoice("daily")).toThrow("Invalid repeat option");
  });
});
