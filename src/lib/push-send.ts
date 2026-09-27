import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";
import { db } from "@/db";
import { groups, members, pushSubscriptions } from "@/db/schema";
import {
  isExpiredSubscriptionStatus,
  pushRecipients,
  type PushMessage,
} from "@/lib/push";

type Vapid = { subject: string; publicKey: string; privateKey: string };

function vapidConfig(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

/** Public key the browser subscribes with; null hides the opt-in. */
export function getVapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

type Target = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(targets: Target[], message: PushMessage) {
  const vapid = vapidConfig();
  if (!vapid || targets.length === 0) return;

  const payload = JSON.stringify(message);
  const expired: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
          { vapidDetails: vapid, TTL: 60 * 60 * 24, timeout: 10_000 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (isExpiredSubscriptionStatus(status)) {
          expired.push(target.id);
        } else {
          console.error("Push delivery failed", status, err);
        }
      }
    }),
  );

  if (expired.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, expired));
  }
}

/** Push to every device a user has opted in on. */
export async function sendPushToUser(userId: string, message: PushMessage) {
  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  await deliver(targets, message);
}

export type GroupPush = {
  groupId: string;
  /** Members involved, or the whole group; the actor and unlinked
   * placeholders are skipped. */
  memberIds: readonly (string | null | undefined)[] | "everyone";
  actorMemberId: string | null;
  /** Notification text; the group name is the title. */
  body: (group: { name: string; currency: string }) => string;
  url: string;
};

async function sendGroupPush(push: GroupPush) {
  if (!vapidConfig()) return;
  const everyone = push.memberIds === "everyone";
  const recipientIds =
    push.memberIds === "everyone"
      ? []
      : pushRecipients(push.memberIds, push.actorMemberId);
  if (!everyone && recipientIds.length === 0) return;

  const [group] = await db
    .select({ name: groups.name, currency: groups.currency })
    .from(groups)
    .where(eq(groups.id, push.groupId))
    .limit(1);
  if (!group) return;

  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(members)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, members.userId))
    .where(
      and(
        eq(members.groupId, push.groupId),
        everyone
          ? push.actorMemberId
            ? ne(members.id, push.actorMemberId)
            : undefined
          : inArray(members.id, recipientIds),
        isNotNull(members.userId),
      ),
    );

  await deliver(targets, {
    title: group.name,
    body: push.body(group),
    url: push.url,
  });
}

/**
 * Notify group members once the response is sent, so saving never waits on
 * push services. Call after the change has committed. Outside a request
 * (scripts, tests) or without VAPID keys this does nothing.
 */
export function notifyGroupMembers(push: GroupPush) {
  if (!vapidConfig()) return;
  try {
    after(async () => {
      try {
        await sendGroupPush(push);
      } catch (err) {
        console.error("Push notification failed", err);
      }
    });
  } catch {
    // Not in a request scope; nothing to schedule against.
  }
}
