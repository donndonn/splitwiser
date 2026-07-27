"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  MAX_EXPENSE_TEXT_LENGTH,
  parseExpenseTextWithGemini,
  type ParsedExpenseDefaults,
} from "@/lib/ai/parse-expense-text";
import { consumeAiParseQuota } from "@/lib/ai/rate-limit";

export type ParseExpenseTextResult =
  | { ok: true; defaults: ParsedExpenseDefaults }
  | { ok: false; error: string };

export async function parseExpenseTextAction(
  groupId: string,
  text: string,
): Promise<ParseExpenseTextResult> {
  try {
    const { user, member } = await requireMember(groupId);

    const [[group], roster] = await Promise.all([
      db.select().from(groups).where(eq(groups.id, groupId)).limit(1),
      db
        .select({ id: members.id, displayName: members.displayName })
        .from(members)
        .where(eq(members.groupId, groupId))
        .orderBy(members.createdAt),
    ]);

    if (!group) {
      return { ok: false, error: "Group not found." };
    }

    if (typeof text !== "string") {
      return { ok: false, error: "Describe the expense first." };
    }

    if (text.trim().length > MAX_EXPENSE_TEXT_LENGTH) {
      return {
        ok: false,
        error: `Keep the description under ${MAX_EXPENSE_TEXT_LENGTH} characters.`,
      };
    }

    const quota = await consumeAiParseQuota(user.id);
    if (!quota.ok) {
      return { ok: false, error: quota.error };
    }

    const defaults = await parseExpenseTextWithGemini({
      text,
      currency: group.currency,
      roster,
      defaultPaidById: member.id,
    });

    return { ok: true, defaults };
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "ZodError") {
      return {
        ok: false,
        error: "Could not understand that description. Try being more specific.",
      };
    }
    if (err instanceof Error && err.message) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not parse that description. Try again." };
  }
}
