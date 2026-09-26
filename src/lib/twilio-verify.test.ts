import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkVerificationCode,
  isTwilioVerifyConfigured,
  PhoneVerificationError,
  sendVerificationCode,
} from "./twilio-verify";

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA456");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("twilio verify", () => {
  it("reports whether all three settings are present", () => {
    expect(isTwilioVerifyConfigured()).toBe(true);
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "");
    expect(isTwilioVerifyConfigured()).toBe(false);
  });

  it("posts an SMS verification with basic auth", async () => {
    reply(201, { status: "pending" });
    await sendVerificationCode("+14155550123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://verify.twilio.com/v2/Services/VA456/Verifications");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:secret").toString("base64")}`,
    );
    expect(String(init.body)).toBe("To=%2B14155550123&Channel=sms");
  });

  it("approves only an approved check", async () => {
    reply(200, { status: "approved" });
    await expect(checkVerificationCode("+14155550123", "123456")).resolves.toBe(true);
    reply(200, { status: "pending" });
    await expect(checkVerificationCode("+14155550123", "000000")).resolves.toBe(false);
  });

  it("maps known Twilio errors to readable messages", async () => {
    reply(404, { code: 20404, message: "not found" });
    await expect(checkVerificationCode("+14155550123", "1")).rejects.toThrow(
      /code expired/,
    );
    reply(429, { code: 60203, message: "max attempts" });
    await expect(sendVerificationCode("+14155550123")).rejects.toThrow(
      /Too many codes sent/,
    );
  });

  it("hides unknown errors and network failures behind a generic message", async () => {
    reply(401, { code: 20003, message: "Authenticate" });
    await expect(sendVerificationCode("+14155550123")).rejects.toThrow(
      "Couldn't send the text message. Try again later.",
    );
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(sendVerificationCode("+14155550123")).rejects.toBeInstanceOf(
      PhoneVerificationError,
    );
  });

  it("refuses to call Twilio when unconfigured", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    await expect(sendVerificationCode("+14155550123")).rejects.toThrow(
      /not set up/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
