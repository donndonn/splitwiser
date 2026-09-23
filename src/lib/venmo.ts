import { formatCents } from "@/lib/money";

/** Venmo handles: letters, numbers, underscores, hyphens. Stored without @. */
const VENMO_USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

/** Venmo transaction notes are capped (about 280). Stay well under that. */
const NOTE_MAX = 80;

const APP_FALLBACK_MS = 1500;

export function parseVenmoUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@+/, "");
  if (!username) return null;
  if (!VENMO_USERNAME_RE.test(username)) {
    throw new Error(
      "Use letters, numbers, hyphens, or underscores (up to 30).",
    );
  }
  return username;
}

export function venmoSettleNote(groupName: string): string {
  const name = groupName.replace(/\s+/g, " ").trim();
  const note = name ? `Splitwiser · ${name}` : "Splitwiser";
  return note.length <= NOTE_MAX ? note : note.slice(0, NOTE_MAX);
}

/**
 * Native Venmo pay link. `recipients` is what the app uses to pick the person.
 * https://venmo.com/{user}?txn=pay does not always hand the recipient through.
 */
export function venmoAppPayUrl(
  username: string,
  amount: string,
  note: string,
): string {
  return `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(username)}&amount=${encodeURIComponent(amount)}&note=${encodeURIComponent(note)}`;
}

/**
 * Web pay link with amount and note. Profile-only `/u/{user}` does not prefill.
 * On phones, try {@link venmoAppPayUrl} first, then this if the app does not open.
 */
export function venmoWebPayUrl(
  username: string,
  amount: string,
  note: string,
): string {
  return `https://venmo.com/${encodeURIComponent(username)}?txn=pay&amount=${encodeURIComponent(amount)}&note=${encodeURIComponent(note)}`;
}

export type VenmoPayLink = {
  toMemberId: string;
  username: string;
  amountCents: number;
  amount: string;
  note: string;
  appUrl: string;
  webUrl: string;
};

export function listVenmoPayLinks(input: {
  currency: string;
  groupName: string;
  currentMemberId: string;
  suggestions: Array<{
    fromMemberId: string;
    toMemberId: string;
    amountCents: number;
  }>;
  venmoUsernameByMemberId: ReadonlyMap<string, string | null | undefined>;
}): VenmoPayLink[] {
  if (input.currency.toUpperCase() !== "USD") return [];

  const note = venmoSettleNote(input.groupName);
  const links: VenmoPayLink[] = [];

  for (const suggestion of input.suggestions) {
    if (suggestion.fromMemberId !== input.currentMemberId) continue;
    if (suggestion.amountCents <= 0) continue;
    const username = input.venmoUsernameByMemberId.get(suggestion.toMemberId);
    if (!username) continue;
    const amount = formatCents(suggestion.amountCents);
    links.push({
      toMemberId: suggestion.toMemberId,
      username,
      amountCents: suggestion.amountCents,
      amount,
      note,
      appUrl: venmoAppPayUrl(username, amount, note),
      webUrl: venmoWebPayUrl(username, amount, note),
    });
  }

  return links;
}

export function prefersVenmoApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Open the Venmo app, then the web pay page if the app does not take over. */
export function openVenmoPay(appUrl: string, webUrl: string): void {
  if (!prefersVenmoApp()) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  let cancelled = false;
  let timer = 0;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", cancel);
  };
  const onHide = () => {
    if (document.hidden) cancel();
  };

  timer = window.setTimeout(() => {
    if (cancelled || document.visibilityState === "hidden") {
      cancel();
      return;
    }
    cancel();
    window.location.assign(webUrl);
  }, APP_FALLBACK_MS);

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", cancel);
  window.location.assign(appUrl);
}
