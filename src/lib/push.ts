import { formatMoney } from "@/lib/money";

/** Payload the service worker turns into a notification (see public/sw.js). */
export type PushMessage = {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  url: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Browser push services we deliver to. Subscriptions carry an endpoint the
 * server POSTs to, so anything else is refused rather than fetched.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/** Validate a `PushSubscription.toJSON()` value sent from the browser. */
export function parsePushSubscription(
  raw: unknown,
): PushSubscriptionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const { endpoint, keys } = raw as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown } | null;
  };
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (
    typeof endpoint !== "string" ||
    endpoint.length > 2048 ||
    !isAllowedPushEndpoint(endpoint) ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !/^[A-Za-z0-9_=-]{16,256}$/.test(p256dh) ||
    !/^[A-Za-z0-9_=-]{8,64}$/.test(auth)
  ) {
    return null;
  }
  return { endpoint, p256dh, auth };
}

/** Members to notify: each once, never the person who made the change. */
export function pushRecipients(
  memberIds: readonly (string | null | undefined)[],
  actorMemberId: string | null,
): string[] {
  const ids = new Set<string>();
  for (const id of memberIds) {
    if (id && id !== actorMemberId) ids.add(id);
  }
  return [...ids];
}

/** The push service says this subscription is gone for good. */
export function isExpiredSubscriptionStatus(statusCode: number | undefined) {
  return statusCode === 404 || statusCode === 410;
}

export function commentPushBody(
  authorName: string,
  expenseDescription: string,
  comment: string,
): string {
  const oneLine = comment.replace(/\s+/g, " ").trim();
  const snippet = oneLine.length > 80 ? `${oneLine.slice(0, 79)}…` : oneLine;
  return `${authorName} commented on “${expenseDescription}”: ${snippet}`;
}

export type PushActivity =
  | { kind: "expense_created"; description: string; amountCents: number }
  | { kind: "expense_updated"; description: string }
  | { kind: "expense_deleted"; description: string }
  | {
      kind: "settlement_recorded";
      fromName: string;
      toName: string;
      amountCents: number;
    }
  | { kind: "member_joined"; memberName: string };

/** One-line notification text for a group change. */
export function activityPushBody(
  actorName: string,
  activity: PushActivity,
  currency: string,
): string {
  switch (activity.kind) {
    case "expense_created":
      return `${actorName} added “${activity.description}” · ${formatMoney(activity.amountCents, currency)}`;
    case "expense_updated":
      return `${actorName} updated “${activity.description}”`;
    case "expense_deleted":
      return `${actorName} deleted “${activity.description}”`;
    case "settlement_recorded":
      return `${activity.fromName} paid ${activity.toName} ${formatMoney(activity.amountCents, currency)}`;
    case "member_joined":
      return `${activity.memberName} joined the group`;
  }
}
