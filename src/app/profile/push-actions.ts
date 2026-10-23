"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { parsePushSubscription } from "@/lib/push";
import { getVapidPublicKey, sendPushToUser } from "@/lib/push-send";

/** Save (or re-point) this browser's subscription to the signed-in user. */
export async function savePushSubscriptionAction(
  raw: unknown,
): Promise<{ ok: boolean }> {
  const user = await requireUser("/profile");
  if (!getVapidPublicKey()) return { ok: false };
  const subscription = parsePushSubscription(raw);
  if (!subscription) return { ok: false };

  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, ...subscription })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });
  return { ok: true };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<void> {
  const user = await requireUser("/profile");
  if (typeof endpoint !== "string") return;
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, user.id),
      ),
    );
}

/** Lets someone check notifications reach this device after opting in. */
export async function sendTestPushAction(): Promise<void> {
  const user = await requireUser("/profile");
  await sendPushToUser(user.id, {
    title: "Splitwiser",
    body: "Notifications are on for this device.",
    url: "/profile",
  });
}
