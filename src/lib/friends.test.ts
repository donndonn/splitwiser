import { describe, expect, it } from "vitest";
import { deriveFriendStatuses } from "./friends";

describe("deriveFriendStatuses", () => {
  it("maps friendships and both friend request directions", () => {
    const statuses = deriveFriendStatuses(
      "viewer",
      ["friend", "outgoing", "incoming", "none"],
      [{ userIdA: "friend", userIdB: "viewer" }],
      [
        { fromUserId: "viewer", toUserId: "outgoing" },
        { fromUserId: "incoming", toUserId: "viewer" },
      ],
    );

    expect(Object.fromEntries(statuses)).toEqual({
      friend: "friends",
      outgoing: "outgoing",
      incoming: "incoming",
      none: "none",
    });
  });

  it("ignores unrelated rows and keeps friendship as the strongest state", () => {
    const statuses = deriveFriendStatuses(
      "viewer",
      ["friend", "viewer"],
      [{ userIdA: "viewer", userIdB: "friend" }],
      [
        { fromUserId: "viewer", toUserId: "friend" },
        { fromUserId: "other", toUserId: "someone-else" },
      ],
    );

    expect(Object.fromEntries(statuses)).toEqual({ friend: "friends" });
  });
});
