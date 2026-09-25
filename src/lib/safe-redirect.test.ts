import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./safe-redirect";

const origin = "https://splitwiser.example";

describe("safeCallbackPath", () => {
  it("keeps approved local routes", () => {
    expect(safeCallbackPath("/join/abc123", origin)).toBe("/join/abc123");
    expect(safeCallbackPath("/g/g1/expenses/e1", origin)).toBe(
      "/g/g1/expenses/e1",
    );
    expect(safeCallbackPath(`${origin}/friends?x=1`, origin)).toBe(
      "/friends?x=1",
    );
  });

  it("falls back to / for other origins and unknown routes", () => {
    for (const raw of [
      "https://evil.example/join/abc",
      "//evil.example/join/abc",
      "/\\evil.example",
      "/api/auth/signin",
      "/signin",
      "javascript:alert(1)",
      "",
      undefined,
    ]) {
      expect(safeCallbackPath(raw, origin)).toBe("/");
    }
  });
});
