"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { consumeAiParseQuota } from "@/lib/ai/rate-limit";
import {
  isReceiptImageMimeType,
  MAX_RECEIPT_IMAGE_BYTES,
  parseReceiptImageWithGemini,
  receiptDraftSchema,
  receiptToExpenseDefaults,
  type ReceiptDraft,
  type ReceiptParseMode,
} from "@/lib/ai/parse-receipt-image";
import type { ParsedExpenseDefaults } from "@/lib/ai/parse-expense-text";

export type ParseReceiptImageResult =
  | { ok: true; receipt: ReceiptDraft }
  | { ok: false; error: string };

export type ApplyReceiptModeResult =
  | { ok: true; defaults: ParsedExpenseDefaults }
  | { ok: false; error: string };

export async function parseReceiptImageAction(
  groupId: string,
  input: {
    imageBase64: string;
    mimeType: string;
  },
): Promise<ParseReceiptImageResult> {
  try {
    const { user } = await requireMember(groupId);

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      return { ok: false, error: "Group not found." };
    }

    if (!input || typeof input.imageBase64 !== "string") {
      return { ok: false, error: "Add a receipt photo first." };
    }

    const imageBase64 = input.imageBase64.trim();
    if (!imageBase64) {
      return { ok: false, error: "Add a receipt photo first." };
    }

    // Rough byte length of decoded base64 (ignore padding).
    const approxBytes = Math.floor((imageBase64.length * 3) / 4);
    if (approxBytes > MAX_RECEIPT_IMAGE_BYTES) {
      return {
        ok: false,
        error: "That photo is still too large. Try a closer crop of the receipt.",
      };
    }

    if (!isReceiptImageMimeType(input.mimeType)) {
      return {
        ok: false,
        error: "Use a JPEG, PNG, or WebP photo of the receipt.",
      };
    }

    const quota = await consumeAiParseQuota(user.id);
    if (!quota.ok) {
      return { ok: false, error: quota.error };
    }

    const receipt = await parseReceiptImageWithGemini({
      imageBase64,
      mimeType: input.mimeType,
      currency: group.currency,
    });

    return { ok: true, receipt };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "ZodError"
    ) {
      return {
        ok: false,
        error: "Could not understand that receipt. Try a clearer photo.",
      };
    }
    if (err instanceof Error && err.message) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: "Could not read that receipt. Try again.",
    };
  }
}

export async function applyReceiptModeAction(
  groupId: string,
  receipt: ReceiptDraft,
  mode: ReceiptParseMode,
): Promise<ApplyReceiptModeResult> {
  try {
    const { member } = await requireMember(groupId);

    const roster = await db
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(eq(members.groupId, groupId))
      .orderBy(members.createdAt);

    if (mode !== "split" && mode !== "assign") {
      return { ok: false, error: "Choose how to split the receipt." };
    }

    const parsed = receiptDraftSchema.safeParse(receipt);
    if (!parsed.success) {
      return { ok: false, error: "Receipt data is invalid. Scan again." };
    }

    const defaults = receiptToExpenseDefaults(
      parsed.data,
      mode,
      roster,
      member.id,
    );

    return { ok: true, defaults };
  } catch (err) {
    if (err instanceof Error && err.message) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not prepare that expense. Try again." };
  }
}
