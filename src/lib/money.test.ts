import { describe, expect, it } from "vitest";
import {
  allocateSplits,
  formatCents,
  formatMoney,
  parseAmountToCents,
  suggestSettlements,
} from "./money";

describe("parseAmountToCents", () => {
  it("parses whole and fractional amounts", () => {
    expect(parseAmountToCents("12")).toBe(1200);
    expect(parseAmountToCents("12.3")).toBe(1230);
    expect(parseAmountToCents("12.34")).toBe(1234);
    expect(parseAmountToCents("0.01")).toBe(1);
  });

  it("rejects invalid input", () => {
    expect(() => parseAmountToCents("abc")).toThrow();
    expect(() => parseAmountToCents("12.345")).toThrow();
  });
});

describe("formatCents", () => {
  it("formats cents with two decimals", () => {
    expect(formatCents(1234)).toBe("12.34");
    expect(formatCents(-50)).toBe("-0.50");
    expect(formatCents(0)).toBe("0.00");
  });
});

describe("formatMoney", () => {
  it("includes currency symbol", () => {
    expect(formatMoney(1234, "USD")).toMatch(/12\.34/);
  });
});

describe("allocateSplits", () => {
  it("splits equally with largest remainder", () => {
    const result = allocateSplits(100, "equal", [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 1 },
    ]);
    expect(result.reduce((s, r) => s + r.amountCents, 0)).toBe(100);
    expect(result.map((r) => r.amountCents).sort()).toEqual([33, 33, 34]);
  });

  it("splits by percent", () => {
    const result = allocateSplits(10000, "percent", [
      { memberId: "a", weight: 50 },
      { memberId: "b", weight: 30 },
      { memberId: "c", weight: 20 },
    ]);
    expect(result.find((r) => r.memberId === "a")?.amountCents).toBe(5000);
    expect(result.find((r) => r.memberId === "b")?.amountCents).toBe(3000);
    expect(result.find((r) => r.memberId === "c")?.amountCents).toBe(2000);
  });

  it("rejects percents that do not sum to 100", () => {
    expect(() =>
      allocateSplits(100, "percent", [
        { memberId: "a", weight: 40 },
        { memberId: "b", weight: 40 },
      ]),
    ).toThrow(/100/);
  });

  it("accepts exact amounts that sum to total", () => {
    const result = allocateSplits(1000, "exact", [
      { memberId: "a", weight: 600 },
      { memberId: "b", weight: 400 },
    ]);
    expect(result).toEqual([
      { memberId: "a", amountCents: 600, weight: 600 },
      { memberId: "b", amountCents: 400, weight: 400 },
    ]);
  });

  it("splits by shares", () => {
    const result = allocateSplits(1000, "shares", [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 3 },
    ]);
    expect(result.find((r) => r.memberId === "a")?.amountCents).toBe(250);
    expect(result.find((r) => r.memberId === "b")?.amountCents).toBe(750);
  });

  it("rejects negative weights", () => {
    expect(() =>
      allocateSplits(1000, "shares", [
        { memberId: "a", weight: 2 },
        { memberId: "b", weight: -1 },
      ]),
    ).toThrow(/non-negative/);
  });
});

describe("suggestSettlements", () => {
  it("produces minimal transfers", () => {
    const transfers = suggestSettlements([
      { memberId: "a", netCents: 500 },
      { memberId: "b", netCents: -300 },
      { memberId: "c", netCents: -200 },
    ]);
    expect(transfers).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountCents: 300 },
      { fromMemberId: "c", toMemberId: "a", amountCents: 200 },
    ]);
  });

  it("returns empty when settled", () => {
    expect(
      suggestSettlements([
        { memberId: "a", netCents: 0 },
        { memberId: "b", netCents: 0 },
      ]),
    ).toEqual([]);
  });
});
