import { and, count, eq, gt, lt, min } from "drizzle-orm";
import { db } from "@/db";
import { aiParseRequests } from "@/db/schema";

export const AI_PARSE_LIMIT_PER_MINUTE = 6;
export const AI_PARSE_LIMIT_PER_HOUR = 60;
export const AI_PARSE_MINUTE_WINDOW_MS = 60 * 1000;
export const AI_PARSE_HOUR_WINDOW_MS = 60 * 60 * 1000;
/** Drop usage rows older than this when checking quota. */
export const AI_PARSE_PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export type AiParseQuotaResult =
  | { ok: true; remainingMinute: number; remainingHour: number }
  | { ok: false; error: string };

function retryAfterMinutes(oldestInWindow: Date | null, windowMs: number): number {
  if (!oldestInWindow) return 1;
  const msLeft = oldestInWindow.getTime() + windowMs - Date.now();
  return Math.max(1, Math.ceil(msLeft / (60 * 1000)));
}

async function countInWindow(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(aiParseRequests)
    .where(
      and(
        eq(aiParseRequests.userId, userId),
        gt(aiParseRequests.createdAt, since),
      ),
    );
  return Number(row?.value ?? 0);
}

async function oldestInWindow(
  userId: string,
  since: Date,
): Promise<Date | null> {
  const [row] = await db
    .select({ oldest: min(aiParseRequests.createdAt) })
    .from(aiParseRequests)
    .where(
      and(
        eq(aiParseRequests.userId, userId),
        gt(aiParseRequests.createdAt, since),
      ),
    );
  return row?.oldest ?? null;
}

/**
 * Sliding-window quota: 6/minute and 60/hour per user.
 * Inserts a usage row when allowed. Prunes rows older than 24h for this user.
 */
export async function consumeAiParseQuota(
  userId: string,
): Promise<AiParseQuotaResult> {
  const now = Date.now();
  const pruneBefore = new Date(now - AI_PARSE_PRUNE_AFTER_MS);
  const minuteSince = new Date(now - AI_PARSE_MINUTE_WINDOW_MS);
  const hourSince = new Date(now - AI_PARSE_HOUR_WINDOW_MS);

  await db
    .delete(aiParseRequests)
    .where(
      and(
        eq(aiParseRequests.userId, userId),
        lt(aiParseRequests.createdAt, pruneBefore),
      ),
    );

  const [minuteCount, hourCount] = await Promise.all([
    countInWindow(userId, minuteSince),
    countInWindow(userId, hourSince),
  ]);

  if (minuteCount >= AI_PARSE_LIMIT_PER_MINUTE) {
    const oldest = await oldestInWindow(userId, minuteSince);
    const minutes = retryAfterMinutes(oldest, AI_PARSE_MINUTE_WINDOW_MS);
    return {
      ok: false,
      error:
        minutes <= 1
          ? `AI parse limit reached (${AI_PARSE_LIMIT_PER_MINUTE}/minute). Try again in a minute.`
          : `AI parse limit reached (${AI_PARSE_LIMIT_PER_MINUTE}/minute). Try again in ~${minutes} minutes.`,
    };
  }

  if (hourCount >= AI_PARSE_LIMIT_PER_HOUR) {
    const oldest = await oldestInWindow(userId, hourSince);
    const minutes = retryAfterMinutes(oldest, AI_PARSE_HOUR_WINDOW_MS);
    return {
      ok: false,
      error: `AI parse limit reached (${AI_PARSE_LIMIT_PER_HOUR}/hour). Try again in ~${minutes} minutes.`,
    };
  }

  await db.insert(aiParseRequests).values({ userId });

  return {
    ok: true,
    remainingMinute: AI_PARSE_LIMIT_PER_MINUTE - minuteCount - 1,
    remainingHour: AI_PARSE_LIMIT_PER_HOUR - hourCount - 1,
  };
}
