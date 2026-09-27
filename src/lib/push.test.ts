import { describe, expect, it } from "vitest";
import {
  activityPushBody,
  commentPushBody,
  isAllowedPushEndpoint,
  isExpiredSubscriptionStatus,
  parsePushSubscription,
  pushRecipients,
} from "./push";

const keys = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGx",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://evil.example.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example.com/x",
    "https://notpush.apple.com/x",
    "https://user@web.push.apple.com/x",
    "not a url",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe("parsePushSubscription", () => {
  it("reads a browser subscription", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        expirationTime: null,
        keys,
      }),
    ).toEqual({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...keys });
  });

  it("rejects missing keys and unknown hosts", () => {
    expect(parsePushSubscription(null)).toBeNull();
    expect(
      parsePushSubscription({ endpoint: "https://fcm.googleapis.com/x" }),
    ).toBeNull();
    expect(
      parsePushSubscription({ endpoint: "https://example.com/x", keys }),
    ).toBeNull();
    expect(
      parsePushSubscription({
        endpoint: "https://fcm.googleapis.com/x",
        keys: { ...keys, auth: "not base64!" },
      }),
    ).toBeNull();
  });
});

describe("pushRecipients", () => {
  it("dedupes and skips the actor and blanks", () => {
    expect(pushRecipients(["a", "b", "a", null, "me", undefined], "me")).toEqual(
      ["a", "b"],
    );
  });
});

describe("isExpiredSubscriptionStatus", () => {
  it("treats 404 and 410 as gone", () => {
    expect(isExpiredSubscriptionStatus(404)).toBe(true);
    expect(isExpiredSubscriptionStatus(410)).toBe(true);
    expect(isExpiredSubscriptionStatus(429)).toBe(false);
    expect(isExpiredSubscriptionStatus(undefined)).toBe(false);
  });
});

describe("commentPushBody", () => {
  it("quotes a one-line snippet", () => {
    expect(commentPushBody("Ana", "Dinner", "Was  this\nthe tip?")).toBe(
      "Ana commented on “Dinner”: Was this the tip?",
    );
  });

  it("shortens long comments", () => {
    const body = commentPushBody("Ana", "Dinner", "x".repeat(200));
    expect(body.endsWith("…")).toBe(true);
    expect(body.length).toBe("Ana commented on “Dinner”: ".length + 80);
  });
});

describe("activityPushBody", () => {
  it("describes each notified change", () => {
    expect(
      activityPushBody(
        "Ana",
        { kind: "expense_created", description: "Pizza", amountCents: 3000 },
        "USD",
      ),
    ).toBe("Ana added “Pizza” · $30.00");
    expect(
      activityPushBody("Ana", { kind: "expense_deleted", description: "Pizza" }, "USD"),
    ).toBe("Ana deleted “Pizza”");
    expect(
      activityPushBody(
        "Ana",
        {
          kind: "settlement_recorded",
          fromName: "Bob",
          toName: "Ana",
          amountCents: 1250,
        },
        "USD",
      ),
    ).toBe("Bob paid Ana $12.50");
    expect(
      activityPushBody("Cy", { kind: "member_joined", memberName: "Cy" }, "USD"),
    ).toBe("Cy joined the group");
  });
});
