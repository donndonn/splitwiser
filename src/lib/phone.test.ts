import { describe, expect, it } from "vitest";
import {
  canTextPhone,
  formatPhone,
  looksLikePhone,
  normalizePhone,
  phoneCountry,
} from "./phone";

describe("looksLikePhone", () => {
  it("accepts digits with common separators", () => {
    expect(looksLikePhone("(415) 555-0123")).toBe(true);
    expect(looksLikePhone("+886 912 345 678")).toBe(true);
    expect(looksLikePhone("0912345678")).toBe(true);
  });

  it("rejects emails, handles, and short digit runs", () => {
    expect(looksLikePhone("a@b.com")).toBe(false);
    expect(looksLikePhone("@alice")).toBe(false);
    expect(looksLikePhone("alice_1")).toBe(false);
    expect(looksLikePhone("12345")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("reads bare numbers as US by default", () => {
    expect(normalizePhone("(415) 555-0123")).toBe("+14155550123");
    expect(normalizePhone("415.555.0123")).toBe("+14155550123");
  });

  it("keeps an explicit country code", () => {
    expect(normalizePhone("+886 912 345 678")).toBe("+886912345678");
  });

  it("reads local numbers in the given region", () => {
    expect(normalizePhone("0912-345-678", "TW")).toBe("+886912345678");
  });

  it("returns null for invalid input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("phoneCountry and formatPhone", () => {
  it("round-trips stored numbers", () => {
    expect(phoneCountry("+886912345678")).toBe("TW");
    expect(phoneCountry(null)).toBeUndefined();
    expect(formatPhone("+14155550123")).toBe("+1 415 555 0123");
  });
});

describe("canTextPhone", () => {
  it("allows only supported SMS countries", () => {
    expect(canTextPhone("+14155550123")).toBe(true);
    expect(canTextPhone("+886912345678")).toBe(true);
    expect(canTextPhone("+447911123456")).toBe(false);
  });
});
