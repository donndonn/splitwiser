import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_LENGTH,
  canDeleteComment,
  parseCommentBody,
} from "./expense-comments";

describe("parseCommentBody", () => {
  it("trims whitespace and normalizes line endings", () => {
    expect(parseCommentBody("  Paid in cash\r\nthanks  ")).toEqual({
      ok: true,
      body: "Paid in cash\nthanks",
    });
  });

  it("rejects empty and non-string input", () => {
    expect(parseCommentBody("   ").ok).toBe(false);
    expect(parseCommentBody(null).ok).toBe(false);
  });

  it("rejects comments over the length limit", () => {
    expect(parseCommentBody("a".repeat(MAX_COMMENT_LENGTH)).ok).toBe(true);
    expect(parseCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1)).ok).toBe(false);
  });
});

describe("canDeleteComment", () => {
  it("lets the author delete", () => {
    expect(
      canDeleteComment({ authorMemberId: "m1" }, { id: "m1", isAdmin: false }),
    ).toBe(true);
  });

  it("lets admins delete anyone's comment, including departed authors", () => {
    expect(
      canDeleteComment({ authorMemberId: "m2" }, { id: "m1", isAdmin: true }),
    ).toBe(true);
    expect(
      canDeleteComment({ authorMemberId: null }, { id: "m1", isAdmin: true }),
    ).toBe(true);
  });

  it("does not let other members delete", () => {
    expect(
      canDeleteComment({ authorMemberId: "m2" }, { id: "m1", isAdmin: false }),
    ).toBe(false);
    expect(
      canDeleteComment({ authorMemberId: null }, { id: "m1", isAdmin: false }),
    ).toBe(false);
  });
});
