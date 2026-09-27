export const MAX_COMMENT_LENGTH = 1000;

export type ParsedCommentBody =
  | { ok: true; body: string }
  | { ok: false; error: string };

/** Trim a submitted comment and check it fits the column constraint. */
export function parseCommentBody(raw: unknown): ParsedCommentBody {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comments can be up to ${MAX_COMMENT_LENGTH} characters.`,
    };
  }
  return { ok: true, body };
}

/** Authors can delete their own comments; group admins can delete any. */
export function canDeleteComment(
  comment: { authorMemberId: string | null },
  viewer: { id: string; isAdmin: boolean },
): boolean {
  return viewer.isAdmin || comment.authorMemberId === viewer.id;
}
