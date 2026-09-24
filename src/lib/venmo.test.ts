import { describe, expect, it } from "vitest";
import {
  listVenmoPayLinks,
  listVenmoRequestLinks,
  parseVenmoUsername,
  venmoAppChargeUrl,
  venmoAppPayUrl,
  venmoSettleNote,
  venmoWebChargeUrl,
  venmoWebPayUrl,
} from "./venmo";

describe("parseVenmoUsername", () => {
  it("strips @ and surrounding space and keeps case", () => {
    expect(parseVenmoUsername("  @Vince-Chiang  ")).toBe("Vince-Chiang");
    expect(parseVenmoUsername("@@alice_1")).toBe("alice_1");
  });

  it("treats blank as unset", () => {
    expect(parseVenmoUsername("")).toBeNull();
    expect(parseVenmoUsername("   ")).toBeNull();
    expect(parseVenmoUsername("@")).toBeNull();
  });

  it("rejects characters Venmo handles do not use", () => {
    expect(() => parseVenmoUsername("no spaces")).toThrow(/letters, numbers/);
    expect(() => parseVenmoUsername("a.b")).toThrow(/letters, numbers/);
    expect(() => parseVenmoUsername("x".repeat(31))).toThrow(/letters, numbers/);
  });
});

describe("venmo pay urls", () => {
  it("builds an app link with recipient, amount, and note", () => {
    const url = venmoAppPayUrl("Vince-Chiang", "12.50", "Splitwiser · Cabin");
    expect(url).toBe(
      "venmo://paycharge?txn=pay&recipients=Vince-Chiang&amount=12.50&note=Splitwiser%20%C2%B7%20Cabin",
    );
  });

  it("builds a web link that prefills amount and note", () => {
    const url = venmoWebPayUrl("alice_1", "4.00", "Splitwiser");
    expect(url).toBe(
      "https://venmo.com/alice_1?txn=pay&amount=4.00&note=Splitwiser",
    );
  });

  it("builds a charge link with the same shape as pay", () => {
    expect(venmoAppChargeUrl("Allison", "6.17", "Splitwiser · Cabin")).toBe(
      "venmo://paycharge?txn=charge&recipients=Allison&amount=6.17&note=Splitwiser%20%C2%B7%20Cabin",
    );
    expect(venmoWebChargeUrl("Allison", "6.17", "Splitwiser")).toBe(
      "https://venmo.com/Allison?txn=charge&amount=6.17&note=Splitwiser",
    );
  });

  it("keeps settle notes short", () => {
    expect(venmoSettleNote("  Cabin  trip ")).toBe("Splitwiser · Cabin trip");
    expect(venmoSettleNote("")).toBe("Splitwiser");
    expect(venmoSettleNote("n".repeat(200)).length).toBe(80);
  });
});

describe("listVenmoPayLinks", () => {
  const venmo = new Map<string, string | null>([
    ["alex", "Alex-V"],
    ["sam", null],
  ]);

  it("links only what the viewer owes a person who saved Venmo", () => {
    const links = listVenmoPayLinks({
      currency: "USD",
      groupName: "Cabin",
      currentMemberId: "me",
      suggestions: [
        { fromMemberId: "me", toMemberId: "alex", amountCents: 1250 },
        { fromMemberId: "me", toMemberId: "sam", amountCents: 500 },
        { fromMemberId: "alex", toMemberId: "me", amountCents: 800 },
        { fromMemberId: "sam", toMemberId: "alex", amountCents: 300 },
      ],
      venmoUsernameByMemberId: venmo,
    });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      toMemberId: "alex",
      username: "Alex-V",
      amount: "12.50",
      note: "Splitwiser · Cabin",
    });
    expect(links[0]?.appUrl).toContain("recipients=Alex-V");
    expect(links[0]?.appUrl).toContain("amount=12.50");
    expect(links[0]?.webUrl).toContain("https://venmo.com/Alex-V?txn=pay");
  });

  it("hides links when the group is not USD", () => {
    expect(
      listVenmoPayLinks({
        currency: "EUR",
        groupName: "Cabin",
        currentMemberId: "me",
        suggestions: [
          { fromMemberId: "me", toMemberId: "alex", amountCents: 1250 },
        ],
        venmoUsernameByMemberId: venmo,
      }),
    ).toEqual([]);
  });
});

describe("listVenmoRequestLinks", () => {
  const venmo = new Map<string, string | null>([
    ["alex", "Alex-V"],
    ["sam", null],
  ]);

  it("requests only from a debtor who saved Venmo", () => {
    const links = listVenmoRequestLinks({
      currency: "usd",
      groupName: "Cabin",
      currentMemberId: "me",
      suggestions: [
        { fromMemberId: "alex", toMemberId: "me", amountCents: 617 },
        { fromMemberId: "sam", toMemberId: "me", amountCents: 400 },
        { fromMemberId: "me", toMemberId: "alex", amountCents: 1250 },
        { fromMemberId: "sam", toMemberId: "alex", amountCents: 300 },
        { fromMemberId: "alex", toMemberId: "me", amountCents: 0 },
      ],
      venmoUsernameByMemberId: venmo,
    });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      fromMemberId: "alex",
      username: "Alex-V",
      amount: "6.17",
      note: "Splitwiser · Cabin",
    });
    expect(links[0]?.appUrl).toContain("txn=charge");
    expect(links[0]?.appUrl).toContain("recipients=Alex-V");
    expect(links[0]?.webUrl).toContain("https://venmo.com/Alex-V?txn=charge");
  });

  it("hides requests when the group is not USD", () => {
    expect(
      listVenmoRequestLinks({
        currency: "EUR",
        groupName: "Cabin",
        currentMemberId: "me",
        suggestions: [
          { fromMemberId: "alex", toMemberId: "me", amountCents: 617 },
        ],
        venmoUsernameByMemberId: venmo,
      }),
    ).toEqual([]);
  });
});
