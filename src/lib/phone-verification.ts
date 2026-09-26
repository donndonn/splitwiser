import { and, count, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { phoneVerificationRequests, users } from "@/db/schema";
import { canTextPhone, normalizePhone } from "@/lib/phone";
import {
  checkVerificationCode,
  PhoneVerificationError,
  sendVerificationCode,
} from "@/lib/twilio-verify";

export { PhoneVerificationError };

export const PHONE_CODE_LIMIT_PER_HOUR = 5;
export const PHONE_CODE_LIMIT_PER_DAY = 10;
/** Site-wide ceiling on texts per day, so abuse can't run up the SMS bill. */
export const PHONE_CODE_SITE_LIMIT_PER_DAY = 200;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CODE_RE = /^\d{4,10}$/;

function parsePhoneForSms(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) {
    throw new PhoneVerificationError(
      "Enter a valid phone number. Add the country code for numbers outside the US, e.g. +886.",
    );
  }
  if (!canTextPhone(phone)) {
    throw new PhoneVerificationError(
      "Only US and Taiwan numbers are supported for now.",
    );
  }
  return phone;
}

/**
 * Records a send if the user and the site are under their limits.
 * One advisory lock serializes sends, so parallel requests can't overshoot.
 */
async function consumeSendQuota(userId: string, phone: string): Promise<void> {
  const now = Date.now();
  const hourAgo = new Date(now - HOUR_MS);
  const dayAgo = new Date(now - DAY_MS);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('phone_verification_send'))`,
    );
    await tx
      .delete(phoneVerificationRequests)
      .where(lt(phoneVerificationRequests.createdAt, dayAgo));

    const [[site], [userDay], [userHour]] = await Promise.all([
      tx.select({ n: count() }).from(phoneVerificationRequests),
      tx
        .select({ n: count() })
        .from(phoneVerificationRequests)
        .where(eq(phoneVerificationRequests.userId, userId)),
      tx
        .select({ n: count() })
        .from(phoneVerificationRequests)
        .where(
          and(
            eq(phoneVerificationRequests.userId, userId),
            gt(phoneVerificationRequests.createdAt, hourAgo),
          ),
        ),
    ]);

    if (Number(userHour?.n ?? 0) >= PHONE_CODE_LIMIT_PER_HOUR) {
      throw new PhoneVerificationError(
        "Too many codes requested. Try again in an hour.",
      );
    }
    if (Number(userDay?.n ?? 0) >= PHONE_CODE_LIMIT_PER_DAY) {
      throw new PhoneVerificationError(
        "Too many codes requested today. Try again tomorrow.",
      );
    }
    if (Number(site?.n ?? 0) >= PHONE_CODE_SITE_LIMIT_PER_DAY) {
      console.error("Phone verification site-wide daily limit reached");
      throw new PhoneVerificationError(
        "Phone verification is busy right now. Try again tomorrow.",
      );
    }

    await tx.insert(phoneVerificationRequests).values({ userId, phone });
  });
}

/** Text a code to `raw`. Returns the normalized number the code went to. */
export async function requestPhoneCode(
  userId: string,
  raw: string,
): Promise<string> {
  const phone = parsePhoneForSms(raw);

  const [current] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (current?.phone === phone) {
    throw new PhoneVerificationError("That number is already verified.");
  }

  await consumeSendQuota(userId, phone);
  await sendVerificationCode(phone);
  return phone;
}

/**
 * Save `phone` on the account once Twilio approves the code. A verified
 * owner takes the number over from any other account (recycled numbers).
 */
export async function confirmPhoneCode(
  userId: string,
  phone: string,
  rawCode: string,
): Promise<void> {
  const code = rawCode.replace(/\s/g, "");
  if (!CODE_RE.test(code)) {
    throw new PhoneVerificationError("Enter the code from the text message.");
  }
  if (normalizePhone(phone) !== phone || !canTextPhone(phone)) {
    throw new PhoneVerificationError("Send a new code and try again.");
  }

  if (!(await checkVerificationCode(phone, code))) {
    throw new PhoneVerificationError("That code is not right.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ phone: null })
      .where(and(eq(users.phone, phone), ne(users.id, userId)));
    await tx.update(users).set({ phone }).where(eq(users.id, userId));
  });
}

export async function removePhone(userId: string): Promise<void> {
  await db.update(users).set({ phone: null }).where(eq(users.id, userId));
}
