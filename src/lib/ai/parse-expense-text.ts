import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  inferItemizedAdjustments,
  lineTotalCents,
} from "@/lib/itemized-expense";
import { formatCents, parseAmountToCents, type SplitMode } from "@/lib/money";

export const MAX_EXPENSE_TEXT_LENGTH = 2000;

const splitModes = ["equal", "exact", "percent", "shares"] as const;
const entryModes = ["simple", "itemized"] as const;

export type ParsedSimpleExpenseDefaults = {
  entryMode: "simple";
  description: string;
  amount: string;
  paidByMemberId: string;
  spentAt: string;
  notes?: string;
  splitMode: SplitMode;
  included: string[];
  weights?: Record<string, number>;
};

export type ParsedItemizedExpenseDefaults = {
  entryMode: "itemized";
  description: string;
  amount: string;
  paidByMemberId: string;
  spentAt: string;
  notes?: string;
  tax?: string;
  tip?: string;
  items: {
    description: string;
    amount: string;
    quantity: number;
    memberIds: string[];
  }[];
};

export type ParsedExpenseDefaults =
  | ParsedSimpleExpenseDefaults
  | ParsedItemizedExpenseDefaults;

export const expenseDraftSchema = z.object({
  entryMode: z.enum(entryModes),
  description: z.string().min(1),
  amount: z.number().positive(),
  spentAt: z.string().nullable(),
  notes: z.string().nullable(),
  tax: z.number().nonnegative().nullable().optional(),
  tip: z.number().nonnegative().nullable().optional(),
  splitMode: z.enum(splitModes),
  paidByName: z.string().nullable(),
  participants: z.array(
    z.object({
      name: z.string().min(1),
      weight: z.number().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      quantity: z.number().int().positive().nullable(),
      assigneeNames: z.array(z.string().min(1)).min(1),
    }),
  ),
});

export type ExpenseDraft = z.infer<typeof expenseDraftSchema>;

/** JSON Schema for Gemini structured output (subset Gemini accepts). */
export const expenseDraftJsonSchema = {
  type: "object",
  properties: {
    entryMode: {
      type: "string",
      enum: [...entryModes],
      description:
        "Use itemized when the text lists per-person dishes/drinks/line items. Use simple for a single total split.",
    },
    description: {
      type: "string",
      description: "Short expense title, e.g. Dinner or Uber",
    },
    amount: {
      type: "number",
      description:
        "Grand total / receipt total as a positive decimal (not cents). Includes tax and already-paid tip.",
    },
    spentAt: {
      type: ["string", "null"],
      description: "Date as YYYY-MM-DD, or null if not mentioned",
    },
    notes: {
      type: ["string", "null"],
      description: "Optional extra notes, or null",
    },
    tax: {
      type: ["number", "null"],
      description:
        "Tax amount if stated separately, otherwise null. Do not invent tax or create a tax line item.",
    },
    tip: {
      type: ["number", "null"],
      description:
        "Tip/gratuity if already included in the grand total, otherwise null. Do not copy suggested unpaid tips.",
    },
    splitMode: {
      type: "string",
      enum: [...splitModes],
      description:
        "Only for simple mode. How to split: equal, exact, percent, or shares. For itemized use equal.",
    },
    paidByName: {
      type: ["string", "null"],
      description:
        "Display name of who paid, or null if the current user / not specified",
    },
    participants: {
      type: "array",
      description:
        "Simple mode only: people in the split. Empty array for itemized mode.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          weight: {
            type: ["number", "null"],
            description:
              "For exact: share amount in currency units; for percent: percentage; for shares: share count; null for equal",
          },
        },
        required: ["name", "weight"],
      },
    },
    items: {
      type: "array",
      description:
        "Itemized mode only: receipt line items (food/drinks/etc). Empty array for simple mode. Do NOT invent tax/tip as a line item or as a fake person — tax and tip are the grand total minus item subtotal.",
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
            description: "Quantity, or null for 1",
          },
          assigneeNames: {
            type: "array",
            items: { type: "string" },
            description: "Roster names of who shared this item",
          },
        },
        required: ["description", "amount", "quantity", "assigneeNames"],
      },
    },
  },
  required: [
    "entryMode",
    "description",
    "amount",
    "spentAt",
    "notes",
    "splitMode",
    "paidByName",
    "participants",
    "items",
  ],
} as const;

export type RosterMember = {
  id: string;
  displayName: string;
};

/** Match a free-form name to a roster member id. */
export function matchMemberName(
  name: string,
  roster: RosterMember[],
  meMemberId?: string,
): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  if (
    meMemberId &&
    (needle === "me" || needle === "i" || needle === "myself")
  ) {
    return meMemberId;
  }

  const exact = roster.find(
    (member) => member.displayName.trim().toLowerCase() === needle,
  );
  if (exact) return exact.id;

  const partial = roster.filter((member) => {
    const hay = member.displayName.trim().toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
  if (partial.length === 1) return partial[0].id;

  return null;
}

function amountToFormString(amount: number): string {
  return formatCents(Math.round(amount * 100));
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime());
}

function resolvePaidBy(
  paidByName: string | null,
  roster: RosterMember[],
  defaultPaidById: string,
): string {
  if (!paidByName) return defaultPaidById;
  return matchMemberName(paidByName, roster, defaultPaidById) ?? defaultPaidById;
}

function resolveSpentAt(spentAt: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  return spentAt && isValidDateString(spentAt) ? spentAt : today;
}

export function draftToExpenseDefaults(
  draft: ExpenseDraft,
  roster: RosterMember[],
  defaultPaidById: string,
): ParsedExpenseDefaults {
  const paidByMemberId = resolvePaidBy(
    draft.paidByName,
    roster,
    defaultPaidById,
  );
  const spentAt = resolveSpentAt(draft.spentAt);
  const common = {
    description: draft.description.trim(),
    amount: amountToFormString(draft.amount),
    paidByMemberId,
    spentAt,
    notes: draft.notes?.trim() || undefined,
  };

  if (draft.entryMode === "itemized") {
    const items = draft.items
      .map((item) => {
        const memberIds = [
          ...new Set(
            item.assigneeNames
              .map((name) => matchMemberName(name, roster, defaultPaidById))
              .filter((id): id is string => id != null),
          ),
        ];
        if (memberIds.length === 0) return null;
        return {
          description: item.description.trim(),
          amount: amountToFormString(item.amount),
          quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
          memberIds,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    if (items.length === 0) {
      // Fall back to simple equal among anyone we can infer from text via participants.
      return draftToExpenseDefaults(
        { ...draft, entryMode: "simple", items: [] },
        roster,
        defaultPaidById,
      );
    }

    const itemSubtotalCents = items.reduce((sum, item) => {
      return (
        sum + lineTotalCents(parseAmountToCents(item.amount), item.quantity)
      );
    }, 0);
    const { taxCents, tipCents } = inferItemizedAdjustments({
      itemSubtotalCents,
      printedTotalCents: Math.round(draft.amount * 100),
      parsedTaxCents: draft.tax != null ? Math.round(draft.tax * 100) : null,
      parsedTipCents: draft.tip != null ? Math.round(draft.tip * 100) : null,
    });

    return {
      entryMode: "itemized",
      ...common,
      amount: formatCents(itemSubtotalCents + taxCents + tipCents),
      tax: formatCents(taxCents),
      tip: formatCents(tipCents),
      items,
    };
  }

  const included: string[] = [];
  const weights: Record<string, number> = {};
  const splitMode: SplitMode = draft.splitMode;

  for (const participant of draft.participants) {
    const memberId = matchMemberName(
      participant.name,
      roster,
      defaultPaidById,
    );
    if (!memberId) continue;
    if (!included.includes(memberId)) included.push(memberId);
    if (participant.weight != null && Number.isFinite(participant.weight)) {
      // ExpenseForm expects exact-mode weights in cents (same as edit defaults).
      weights[memberId] =
        splitMode === "exact"
          ? Math.round(participant.weight * 100)
          : participant.weight;
    }
  }

  if (included.length === 0) {
    included.push(...roster.map((member) => member.id));
  }

  return {
    entryMode: "simple",
    ...common,
    splitMode,
    included,
    weights: splitMode === "equal" ? undefined : weights,
  };
}

/** @deprecated Use draftToExpenseDefaults */
export const draftToSimpleDefaults = draftToExpenseDefaults;

function buildPrompt(input: {
  text: string;
  currency: string;
  today: string;
  memberNames: string[];
}): string {
  return `Extract a shared expense from the user's free-form text into the JSON schema.

Rules:
- Currency is ${input.currency}. amount is a positive number (not cents).
- spentAt must be YYYY-MM-DD or null. Today is ${input.today}.
- Only use names from this roster (or "me"/"I" for the current user). Roster: ${input.memberNames.join(", ") || "(empty)"}
- description should be short (a few words). Put extra detail in notes.
- paidByName: roster name who paid, or null if "me"/"I"/unspecified.

Choose entryMode carefully:
1) itemized — when the text lists individual dishes, drinks, or other line items with people who had them (even if a grand total is also given).
   - Put each dish/drink as an items[] entry with assigneeNames for who ordered/shared it.
   - amount = the grand/receipt total (includes tax + already-paid tip).
   - tax/tip: separate amounts if stated, otherwise null. Do NOT create a line item or participant for tax, tip, fees, or "the rest".
   - Do NOT include roster members who are never named as assignees.
   - participants must be [].
   - splitMode can be "equal".
2) simple — when there is only a single total to split (no per-item breakdown).
   - Prefer splitMode "equal" unless the text clearly specifies exact amounts, percentages, or shares.
   - Only include named participants. If nobody is named, include every roster member with equal split.
   - items must be [].

Example (itemized): "Lunch paid by me. Grand total 100. I had a cheeseburger 25. Alex had a caesar salad 26. Bob had scallop pasta 27."
→ entryMode itemized, amount 100, items for the three dishes assigned to me/Alex/Bob, do not add other roster members, tax/tip null (leftover 22 is tax).

User text:
${input.text}`;
}

export async function parseExpenseTextWithGemini(input: {
  text: string;
  currency: string;
  roster: RosterMember[];
  defaultPaidById: string;
}): Promise<ParsedExpenseDefaults> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Expense parsing is not configured. Add GOOGLE_API_KEY to the environment.",
    );
  }

  const text = input.text.trim();
  if (!text) {
    throw new Error("Describe the expense first.");
  }
  if (text.length > MAX_EXPENSE_TEXT_LENGTH) {
    throw new Error(
      `Keep the description under ${MAX_EXPENSE_TEXT_LENGTH} characters.`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: buildPrompt({
      text,
      currency: input.currency,
      today,
      memberNames: input.roster.map((member) => member.displayName),
    }),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: expenseDraftJsonSchema,
    },
  });

  const raw = response.text;
  if (!raw?.trim()) {
    throw new Error("Could not parse that description. Try again.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Could not parse that description. Try again.");
  }

  const draft = expenseDraftSchema.parse(parsedJson);
  return draftToExpenseDefaults(draft, input.roster, input.defaultPaidById);
}
