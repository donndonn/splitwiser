/**
 * Minimal Twilio Verify client over REST (no SDK). Twilio generates, texts,
 * and checks the codes, so the app never stores them.
 * https://www.twilio.com/docs/verify/api
 */

const VERIFY_BASE_URL = "https://verify.twilio.com/v2";
const REQUEST_TIMEOUT_MS = 10_000;

type TwilioVerifyConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
};

/** Error with a message that is safe to show the user. */
export class PhoneVerificationError extends Error {}

function readConfig(): TwilioVerifyConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

export function isTwilioVerifyConfigured(): boolean {
  return readConfig() !== null;
}

/** Twilio error codes worth a specific message; anything else is generic. */
const TWILIO_ERROR_MESSAGES: Record<number, string> = {
  20404: "That code expired. Send a new one.",
  20429: "Too many requests. Try again in a few minutes.",
  60200: "That phone number is not valid.",
  60202: "Too many wrong codes. Send a new one.",
  60203: "Too many codes sent to this number. Try again later.",
  60205: "That number can't receive text messages.",
  60410: "We can't send texts to that number.",
  60605: "We can't send texts to that country.",
};

async function postForm(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const config = readConfig();
  if (!config) {
    throw new PhoneVerificationError("Phone verification is not set up.");
  }

  const basic = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString("base64");

  let res: Response;
  try {
    res = await fetch(
      `${VERIFY_BASE_URL}/Services/${encodeURIComponent(config.serviceSid)}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (err) {
    console.error("Twilio Verify request failed", err);
    throw new PhoneVerificationError(
      "Couldn't reach the text message service. Try again.",
    );
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof body.code === "number" ? body.code : undefined;
    const known = code !== undefined ? TWILIO_ERROR_MESSAGES[code] : undefined;
    if (!known) {
      console.error("Twilio Verify error", res.status, code, body.message);
    }
    throw new PhoneVerificationError(
      known ?? "Couldn't send the text message. Try again later.",
    );
  }
  return body;
}

/** Text a verification code to an E.164 number. */
export async function sendVerificationCode(phone: string): Promise<void> {
  await postForm("Verifications", { To: phone, Channel: "sms" });
}

/** True when `code` is the one most recently texted to `phone`. */
export async function checkVerificationCode(
  phone: string,
  code: string,
): Promise<boolean> {
  const body = await postForm("VerificationCheck", { To: phone, Code: code });
  return body.status === "approved";
}
