import { describe, expect, it } from "vitest";
import {
  isSiteAdminEmail,
  parseAdminEmails,
  parseMaxUsers,
  stalePendingCutoff,
} from "./site-admin";

describe("site admin emails", () => {
  it("parses a comma-separated, case-insensitive list", () => {
    expect(parseAdminEmails(" A@Example.com, ,b@example.com ")).toEqual(
      new Set(["a@example.com", "b@example.com"]),
    );
  });

  it("grants nobody when unset or empty", () => {
    expect(isSiteAdminEmail("a@example.com", undefined)).toBe(false);
    expect(isSiteAdminEmail("a@example.com", "")).toBe(false);
    expect(isSiteAdminEmail("", ",")).toBe(false);
    expect(isSiteAdminEmail(null, "a@example.com")).toBe(false);
  });

  it("matches exact addresses only", () => {
    const raw = "owner@example.com";
    expect(isSiteAdminEmail("Owner@Example.com", raw)).toBe(true);
    expect(isSiteAdminEmail("owner@example.com.evil", raw)).toBe(false);
    expect(isSiteAdminEmail("x-owner@example.com", raw)).toBe(false);
  });
});

describe("parseMaxUsers", () => {
  it("accepts whole numbers in range", () => {
    expect(parseMaxUsers(0)).toBe(0);
    expect(parseMaxUsers("750")).toBe(750);
  });

  it.each([-1, 1.5, "", "abc", NaN, 100_001])("rejects %p", (value) => {
    expect(() => parseMaxUsers(value)).toThrow(/whole number/);
  });
});

it("computes the stale-pending cutoff", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  expect(stalePendingCutoff(now, 7).toISOString()).toBe(
    "2026-09-18T12:00:00.000Z",
  );
});
