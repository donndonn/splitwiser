import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  inferItemizedAdjustments,
  lineTotalCents,
} from "@/lib/itemized-expense";
import { formatCents, parseAmountToCents } from "@/lib/money";
import type {
  ParsedExpenseDefaults,
  RosterMember,
} from "@/lib/ai/parse-expense-text";

export const RECEIPT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ReceiptImageMimeType = (typeof RECEIPT_IMAGE_MIME_TYPES)[number];

/** Server-side safety net after client compression. */
export const MAX_RECEIPT_IMAGE_BYTES = 1_000_000;

export type ReceiptParseMode = "split" | "assign";

export const receiptDraftSchema = z.object({
  merchant: z.string().nullable(),
  amount: z.number().positive(),
  spentAt: z.string().nullable(),
  tax: z.number().nonnegative().nullable().optional(),
  tip: z.number().nonnegative().nullable().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      quantity: z.number().int().positive().nullable(),
    }),
  ),
});

export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;

/** JSON Schema for Gemini structured output. */
export const receiptDraftJsonSchema = {
  type: "object",
  properties: {
    merchant: {
      type: ["string", "null"],
      description:
        "Store or restaurant name if visible, otherwise a short title like Dinner or Groceries, or null",
    },
    amount: {
      type: "number",
      description:
        "Grand / receipt total as a positive decimal (not cents). Includes tax and already-paid tip.",
    },
    spentAt: {
      type: ["string", "null"],
      description: "Date as YYYY-MM-DD if visible on the receipt, otherwise null",
    },
    tax: {
      type: ["number", "null"],
      description:
        "Tax line if printed as its own amount, otherwise null. Do not invent tax.",
    },
    tip: {
      type: ["number", "null"],
      description:
        "Gratuity already included in the paid/printed total, otherwise null. Do NOT copy suggested tip amounts that have not been paid yet.",
    },
    items: {
      type: "array",
      description:
        "Purchased line items (food, drinks, products). Do NOT include tax, tip, fees, or subtotal rows.",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Line item name, e.g. Caesar salad",
          },
          amount: {
            type: "number",
            description: "Unit price in currency units (not cents)",
          },
          quantity: {
            type: ["integer", "null"],
            description: "Quantity if shown, otherwise null for 1",
          },
        },
        required: ["description", "amount", "quantity"],
      },
    },
  },
  required: ["merchant", "amount", "spentAt", "items"],
} as const;

function amountToFormString(amount: number): string {
  return formatCents(Math.round(amount * 100));
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime());
}

function resolveSpentAt(spentAt: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  return spentAt && isValidDateString(spentAt) ? spentAt : today;
}

function resolveDescription(merchant: string | null): string {
  const trimmed = merchant?.trim();
  return trimmed || "Receipt";
}

export function isReceiptImageMimeType(
  value: string,
): value is ReceiptImageMimeType {
  return (RECEIPT_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Map OCR receipt fields into ExpenseForm defaults based on the user's choice.
 * - split: simple equal among entire roster
 * - assign: itemized with empty memberIds (user assigns in the form)
 *   Falls back to split if there are no usable line items.
 */
export function receiptToExpenseDefaults(
  receipt: ReceiptDraft,
  mode: ReceiptParseMode,
  roster: RosterMember[],
  defaultPaidById: string,
): ParsedExpenseDefaults {
  const common = {
    description: resolveDescription(receipt.merchant),
    amount: amountToFormString(receipt.amount),
    paidByMemberId: defaultPaidById,
    spentAt: resolveSpentAt(receipt.spentAt),
  };

  if (mode === "assign") {
    const items = receipt.items
      .map((item) => {
        const description = item.description.trim();
        if (!description) return null;
        return {
          description,
          amount: amountToFormString(item.amount),
          quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
          memberIds: [] as string[],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    if (items.length > 0) {
      const itemSubtotalCents = items.reduce((sum, item) => {
        return (
          sum +
          lineTotalCents(parseAmountToCents(item.amount), item.quantity)
        );
      }, 0);
      const printedTotalCents = Math.round(receipt.amount * 100);
      const { taxCents, tipCents } = inferItemizedAdjustments({
        itemSubtotalCents,
        printedTotalCents,
        parsedTaxCents:
          receipt.tax != null ? Math.round(receipt.tax * 100) : null,
        parsedTipCents:
          receipt.tip != null ? Math.round(receipt.tip * 100) : null,
      });
      const amountCents = itemSubtotalCents + taxCents + tipCents;
      return {
        entryMode: "itemized",
        ...common,
        amount: formatCents(amountCents > 0 ? amountCents : printedTotalCents),
        tax: formatCents(taxCents),
        tip: formatCents(tipCents),
        items,
      };
    }
  }

  return {
    entryMode: "simple",
    ...common,
    splitMode: "equal",
    included: roster.map((member) => member.id),
  };
}

function buildReceiptPrompt(input: {
  currency: string;
  today: string;
}): string {
  return `Extract a receipt from the attached image into the JSON schema.

Rules:
- Currency is ${input.currency}. amount is a positive number (not cents).
- amount must be the grand / printed total (includes tax + already-paid tip when present).
- spentAt must be YYYY-MM-DD or null. Today is ${input.today}.
- merchant: store/restaurant name if readable, else a short title, else null.
- tax: the tax line if printed, otherwise null. Do not invent tax.
- tip: gratuity already included in the paid/printed total, otherwise null. Do NOT copy suggested tip percentages or amounts that have not been paid.
- items: only purchased line items. Do NOT include tax, tip, service charge, fees, discounts-as-people, or subtotal/total rows as items.
- If tax is null, tax is implied by grand total minus sum of (item amount × quantity) minus tip.
- If quantity is not shown, use null (treated as 1).
- If line items are unreadable, return items as [] but still extract amount and merchant when possible.
- Do not invent people or assignees.`;
}

export async function parseReceiptImageWithGemini(input: {
  imageBase64: string;
  mimeType: ReceiptImageMimeType;
  currency: string;
}): Promise<ReceiptDraft> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Expense parsing is not configured. Add GOOGLE_API_KEY to the environment.",
    );
  }

  if (!input.imageBase64.trim()) {
    throw new Error("Add a receipt photo first.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: [
      {
        inlineData: {
          mimeType: input.mimeType,
          data: input.imageBase64,
        },
      },
      { text: buildReceiptPrompt({ currency: input.currency, today }) },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: receiptDraftJsonSchema,
    },
  });

  const raw = response.text;
  if (!raw?.trim()) {
    throw new Error("Could not read that receipt. Try a clearer photo.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Could not read that receipt. Try a clearer photo.");
  }

  return receiptDraftSchema.parse(parsedJson);
}
