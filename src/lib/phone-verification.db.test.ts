import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: null as unknown,
  approve: true,
  sent: [] as string[],
}));

vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));

vi.mock("@/lib/twilio-verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./twilio-verify")>();
  return {
    ...actual,
    sendVerificationCode: async (phone: string) => {
      state.sent.push(phone);
    },
    checkVerificationCode: async () => state.approve,
  };
});

const verification = await import("./phone-verification");

describe.skipIf(!hasTestDatabase)("phone verification", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    state.db = t.db;
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    state.approve = true;
    state.sent = [];
    await t.sql`truncate users cascade`;
    await t.sql`
      insert into users (id, email, onboarding_completed_at) values
        ('a', 'a@example.test', now()),
        ('b', 'b@example.test', now())
    `;
  });

  async function phoneOf(id: string) {
    const [row] = await t.sql<{ phone: string | null }[]>`
      select phone from users where id = ${id}
    `;
    return row?.phone ?? null;
  }

  it("texts a normalized number and saves it once the code checks out", async () => {
    await expect(
      verification.requestPhoneCode("a", "(415) 555-0123"),
    ).resolves.toBe("+14155550123");
    expect(state.sent).toEqual(["+14155550123"]);
    expect(await phoneOf("a")).toBeNull();

    await verification.confirmPhoneCode("a", "+14155550123", "123 456");
    expect(await phoneOf("a")).toBe("+14155550123");

    await expect(
      verification.requestPhoneCode("a", "+1 415 555 0123"),
    ).rejects.toThrow(/already verified/);
  });

  it("rejects invalid, unsupported, and unverified numbers", async () => {
    await expect(verification.requestPhoneCode("a", "12345")).rejects.toThrow(
      /valid phone number/,
    );
    await expect(
      verification.requestPhoneCode("a", "+44 7911 123456"),
    ).rejects.toThrow(/US and Taiwan/);
    expect(state.sent).toEqual([]);

    state.approve = false;
    await expect(
      verification.confirmPhoneCode("a", "+14155550123", "000000"),
    ).rejects.toThrow(/not right/);
    await expect(
      verification.confirmPhoneCode("a", "+14155550123", "abc"),
    ).rejects.toThrow(/Enter the code/);
    expect(await phoneOf("a")).toBeNull();
  });

  it("moves a number to the account that verifies it", async () => {
    await t.sql`update users set phone = '+886912345678' where id = 'b'`;
    await verification.confirmPhoneCode("a", "+886912345678", "123456");
    expect(await phoneOf("a")).toBe("+886912345678");
    expect(await phoneOf("b")).toBeNull();
  });

  it("caps codes per user per hour", async () => {
    for (let i = 0; i < verification.PHONE_CODE_LIMIT_PER_HOUR; i++) {
      await verification.requestPhoneCode("a", "+14155550123");
    }
    await expect(
      verification.requestPhoneCode("a", "+14155550124"),
    ).rejects.toThrow(/Try again in an hour/);
    await verification.requestPhoneCode("b", "+14155550124");
    expect(state.sent).toHaveLength(verification.PHONE_CODE_LIMIT_PER_HOUR + 1);
  });

  it("caps codes site-wide per day and forgets sends older than a day", async () => {
    await t.sql`
      insert into phone_verification_requests (id, user_id, phone, created_at)
      select 'old' || g, 'b', '+14155550123', now() - interval '25 hours'
      from generate_series(1, ${verification.PHONE_CODE_SITE_LIMIT_PER_DAY}) g
    `;
    await verification.requestPhoneCode("a", "+14155550123");

    await t.sql`
      insert into phone_verification_requests (id, user_id, phone, created_at)
      select 'new' || g, 'b', '+14155550123', now() - interval '2 hours'
      from generate_series(1, ${verification.PHONE_CODE_SITE_LIMIT_PER_DAY}) g
    `;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      verification.requestPhoneCode("a", "+14155550123"),
    ).rejects.toThrow(/busy right now/);
  });

  it("serializes parallel sends so the hourly cap holds", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        verification.requestPhoneCode("a", "+14155550123"),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      verification.PHONE_CODE_LIMIT_PER_HOUR,
    );
  });

  it("removes a saved number", async () => {
    await t.sql`update users set phone = '+14155550123' where id = 'a'`;
    await verification.removePhone("a");
    expect(await phoneOf("a")).toBeNull();
  });
});
