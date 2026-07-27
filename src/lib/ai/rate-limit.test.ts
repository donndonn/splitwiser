import { describe, expect, it } from "vitest";
import {
  AI_PARSE_LIMIT_PER_HOUR,
  AI_PARSE_LIMIT_PER_MINUTE,
} from "./rate-limit";

describe("AI parse rate limit constants", () => {
  it("allows 6 per minute and 60 per hour", () => {
    expect(AI_PARSE_LIMIT_PER_MINUTE).toBe(6);
    expect(AI_PARSE_LIMIT_PER_HOUR).toBe(60);
  });
});
