import { describe, expect, it } from "vitest";
import {
  nameMatches,
  suggestedCandidates,
  type LinkCandidate,
} from "@/lib/placeholder-links";

function candidate(
  id: string,
  displayName: string,
  username: string | null = null,
): LinkCandidate {
  return {
    id,
    displayName,
    username,
    image: null,
    isFriend: false,
    sharedGroups: [],
  };
}

describe("nameMatches", () => {
  it("matches full names, first names, and usernames, ignoring case", () => {
    expect(nameMatches("sam lee", candidate("a", "Sam Lee"))).toBe(true);
    expect(nameMatches("Sam", candidate("a", "Sam Lee"))).toBe(true);
    expect(nameMatches("Sam Park", candidate("a", "Sam Lee"))).toBe(true);
    expect(nameMatches("@samlee", candidate("a", "Samuel", "samlee"))).toBe(
      true,
    );
  });

  it("does not match different names or single letters", () => {
    expect(nameMatches("Sam", candidate("a", "Samantha"))).toBe(false);
    expect(nameMatches("S", candidate("a", "S Lee"))).toBe(false);
    expect(nameMatches("  ", candidate("a", "Sam"))).toBe(false);
  });
});

describe("suggestedCandidates", () => {
  it("puts exact full-name matches first", () => {
    const list = [candidate("a", "Sam Park"), candidate("b", "Sam Lee")];
    expect(suggestedCandidates("Sam Lee", list).map((c) => c.id)).toEqual([
      "b",
      "a",
    ]);
    expect(suggestedCandidates("Alex", list)).toEqual([]);
  });
});
