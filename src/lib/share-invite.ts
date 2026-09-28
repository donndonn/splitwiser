export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

/**
 * Open the share sheet, or copy the link where sharing isn't supported.
 * Call from a click handler: browsers only allow sharing on a user gesture.
 */
export async function shareOrCopyInvite(
  url: string,
  groupTitle: string,
  options: { text?: string } = {},
) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: groupTitle,
        text: options.text ?? "Join this Splitwiser group",
        url,
      });
      return "shared" as const;
    } catch (err) {
      // User cancelled the share sheet — don't fall through to clipboard.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  await navigator.clipboard.writeText(url);
  return "copied" as const;
}
