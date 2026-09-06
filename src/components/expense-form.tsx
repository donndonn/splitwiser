"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  ImageIcon,
  Minus,
  Plus,
  ReceiptText,
  Scale,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  compressReceiptImage,
  compressedReceiptToFile,
} from "@/lib/ai/compress-receipt-image";
import {
  calculateItemizedExpense,
  inferItemizedAdjustments,
  lineTotalCents,
  tipCentsFromPercent,
  type ItemizedExpenseItemInput,
} from "@/lib/itemized-expense";
import {
  allocateSplits,
  formatCents,
  formatMoney,
  parseAmountToCents,
  type SplitMode,
} from "@/lib/money";
import { cn } from "@/lib/utils";

export type MemberOption = {
  id: string;
  displayName: string;
};

type CommonDefaults = {
  description?: string;
  amount?: string;
  paidByMemberId?: string;
  spentAt?: string;
  notes?: string;
};

export type SimpleExpenseDefaults = CommonDefaults & {
  entryMode: "simple";
  splitMode?: SplitMode;
  weights?: Record<string, number>;
  included?: string[];
};

export type ItemizedExpenseDefaults = CommonDefaults & {
  entryMode: "itemized";
  tax?: string;
  tip?: string;
  items: {
    description: string;
    amount: string;
    quantity: number;
    memberIds: string[];
  }[];
};

type Props = {
  members: MemberOption[];
  currency: string;
  defaultPaidById: string;
  defaultValues?: SimpleExpenseDefaults | ItemizedExpenseDefaults;
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
  allowReceiptUpload?: boolean;
  receiptFile?: File | null;
  children?: React.ReactNode;
};

type ItemDraft = {
  key: string;
  description: string;
  amount: string;
  quantity: number;
  memberIds: string[];
};

type SplitStatus = "idle" | "incomplete" | "invalid" | "balanced";

const TIP_PERCENT_PRESETS = [15, 18, 20] as const;

function memberInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function parseMoneyField(value: string): number {
  if (!value.trim()) return 0;
  const cents = parseAmountToCents(value);
  if (cents < 0) throw new Error("Amount cannot be negative");
  return cents;
}

function initialItemizedAdjustments(defaults?: ItemizedExpenseDefaults): {
  tax: string;
  tip: string;
} {
  if (!defaults) return { tax: "", tip: "0.00" };
  if (defaults.tax != null || defaults.tip != null) {
    return {
      tax: defaults.tax ?? "0.00",
      tip: defaults.tip ?? "0.00",
    };
  }
  try {
    const printedTotalCents = defaults.amount
      ? parseAmountToCents(defaults.amount)
      : 0;
    const itemSubtotalCents = defaults.items.reduce((sum, item) => {
      if (!item.amount.trim()) return sum;
      return (
        sum + lineTotalCents(parseAmountToCents(item.amount), item.quantity)
      );
    }, 0);
    const { taxCents, tipCents } = inferItemizedAdjustments({
      itemSubtotalCents,
      printedTotalCents,
    });
    return { tax: formatCents(taxCents), tip: formatCents(tipCents) };
  } catch {
    return { tax: "", tip: "0.00" };
  }
}

export function ExpenseForm({
  members,
  currency,
  defaultPaidById,
  defaultValues,
  action,
  submitLabel = "Save expense",
  allowReceiptUpload = false,
  receiptFile = null,
  children,
}: Props) {
  const [entryMode, setEntryMode] = useState<"simple" | "itemized">(
    defaultValues?.entryMode ?? "simple",
  );
  const [amount, setAmount] = useState(defaultValues?.amount ?? "");
  const simpleDefaults =
    defaultValues?.entryMode === "simple" ? defaultValues : undefined;
  const itemizedDefaults =
    defaultValues?.entryMode === "itemized" ? defaultValues : undefined;

  const [mode, setMode] = useState<SplitMode>(
    simpleDefaults?.splitMode ?? "equal",
  );
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const member of members) {
      if (simpleDefaults?.included) {
        init[member.id] = simpleDefaults.included.includes(member.id);
      } else if (simpleDefaults?.weights) {
        init[member.id] = simpleDefaults.weights[member.id] != null;
      } else {
        init[member.id] = true;
      }
    }
    return init;
  });
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const member of members) {
      const weight = simpleDefaults?.weights?.[member.id];
      if (weight != null) {
        init[member.id] =
          simpleDefaults?.splitMode === "exact"
            ? formatCents(Math.round(weight))
            : String(weight);
      } else {
        init[member.id] = mode === "percent" ? "" : "1";
      }
    }
    return init;
  });

  const nextItemKey = useRef((itemizedDefaults?.items.length ?? 0) + 1);
  const focusItemKeyRef = useRef<string | null>(null);
  const itemNameInputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const [items, setItems] = useState<ItemDraft[]>(() =>
    itemizedDefaults
      ? itemizedDefaults.items.map((item, index) => ({
          key: `saved-${index}`,
          description: item.description,
          amount: item.amount,
          quantity: item.quantity ?? 1,
          memberIds: item.memberIds,
        }))
      : [
          {
            key: "new-0",
            description: "",
            amount: "",
            quantity: 1,
            memberIds: members.map((member) => member.id),
          },
        ],
  );
  const initialAdjustments = initialItemizedAdjustments(itemizedDefaults);
  const [taxAmount, setTaxAmount] = useState(initialAdjustments.tax);
  const [tipAmount, setTipAmount] = useState(initialAdjustments.tip);
  const [customTipPercent, setCustomTipPercent] = useState("");
  const [paidByMemberId, setPaidByMemberId] = useState(
    defaultValues?.paidByMemberId ?? defaultPaidById,
  );
  const [assignmentItemKey, setAssignmentItemKey] = useState<string | null>(
    null,
  );
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
  const [splitInteracted, setSplitInteracted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [attachedReceipt, setAttachedReceipt] = useState<File | null>(
    receiptFile,
  );
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null,
  );
  const [receiptBusy, setReceiptBusy] = useState(false);

  useEffect(() => {
    if (!attachedReceipt) {
      setReceiptPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedReceipt);
    setReceiptPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedReceipt]);

  useEffect(() => {
    const key = focusItemKeyRef.current;
    if (!key) return;
    const input = itemNameInputRefs.current.get(key);
    if (input) {
      input.focus();
      focusItemKeyRef.current = null;
    }
  }, [items]);

  const selectedMembers = members.filter((member) => included[member.id]);

  const simplePreview = useMemo(() => {
    try {
      if (!amount.trim()) return null;
      const total = parseAmountToCents(amount);
      const inputs = selectedMembers.map((member) => {
        const raw = weights[member.id] ?? "0";
        const weight =
          mode === "exact"
            ? parseAmountToCents(raw || "0")
            : Number(raw || "0");
        return { memberId: member.id, weight };
      });
      const splits = allocateSplits(total, mode, inputs);
      return { total, splits, ok: true as const };
    } catch (previewError) {
      return {
        ok: false as const,
        message:
          previewError instanceof Error
            ? previewError.message
            : "Invalid split",
      };
    }
  }, [amount, mode, selectedMembers, weights]);

  const itemizedPreview = useMemo(() => {
    let itemSubtotalCents = 0;
    let taxCents: number | null = null;
    let tipCents: number | null = null;
    try {
      const parsedItems: ItemizedExpenseItemInput[] = items.map((item, index) => {
        if (!item.amount.trim()) {
          throw new Error(
            `Enter an amount for ${item.description.trim() || `item ${index + 1}`}.`,
          );
        }
        const amountCents = parseAmountToCents(item.amount);
        itemSubtotalCents += lineTotalCents(amountCents, item.quantity);
        return {
          description: item.description,
          amountCents,
          quantity: item.quantity,
          memberIds: item.memberIds,
        };
      });
      taxCents = parseMoneyField(taxAmount);
      tipCents = parseMoneyField(tipAmount);
      const calculation = calculateItemizedExpense({
        items: parsedItems,
        taxCents,
        tipCents,
      });
      return {
        ok: true as const,
        parsedItems,
        calculation,
        itemSubtotalCents,
        taxCents: calculation.taxCents,
        tipCents: calculation.tipCents,
        printedTotalCents: calculation.calculatedTotalCents,
      };
    } catch (previewError) {
      return {
        ok: false as const,
        message:
          previewError instanceof Error
            ? previewError.message
            : "Invalid itemized expense",
        itemSubtotalCents,
        taxCents,
        tipCents,
        printedTotalCents:
          taxCents != null && tipCents != null
            ? itemSubtotalCents + taxCents + tipCents
            : null,
      };
    }
  }, [items, taxAmount, tipAmount]);

  useEffect(() => {
    if (entryMode !== "itemized") return;
    try {
      const tax = parseMoneyField(taxAmount);
      const tip = parseMoneyField(tipAmount);
      if (itemizedPreview.itemSubtotalCents <= 0 && tax === 0 && tip === 0) {
        return;
      }
      const next = formatCents(
        itemizedPreview.itemSubtotalCents + tax + tip,
      );
      setAmount((current) => (current === next ? current : next));
    } catch {
      // Ignore invalid tax/tip while the user is still typing.
    }
  }, [
    entryMode,
    taxAmount,
    tipAmount,
    itemizedPreview.itemSubtotalCents,
  ]);

  const remainder =
    simplePreview?.ok && mode === "exact"
      ? simplePreview.total -
        simplePreview.splits.reduce(
          (sum, result) => sum + result.amountCents,
          0,
        )
      : null;

  const canSubmit =
    entryMode === "simple" ? !!simplePreview?.ok : itemizedPreview.ok;
  const splitModeLabel: Record<SplitMode, string> = {
    equal: "Equally",
    exact: "Exact amounts",
    percent: "By percentage",
    shares: "By shares",
  };
  const currencySymbol =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  const paidByName =
    members.find((member) => member.id === paidByMemberId)?.displayName ??
    "Choose payer";
  const activeAssignmentItem = items.find(
    (item) => item.key === assignmentItemKey,
  );
  const taxCents =
    itemizedPreview.taxCents ??
    (() => {
      try {
        return parseMoneyField(taxAmount);
      } catch {
        return null;
      }
    })();
  const tipCents =
    itemizedPreview.tipCents ??
    (() => {
      try {
        return parseMoneyField(tipAmount);
      } catch {
        return null;
      }
    })();
  const hasUnassignedItems = items.some((item) => item.memberIds.length === 0);
  const splitStatus: SplitStatus = (() => {
    if (entryMode === "simple") {
      if (!amount.trim()) {
        if (splitInteracted && selectedMembers.length === 0) return "invalid";
        if (splitInteracted && mode !== "equal") {
          try {
            for (const member of selectedMembers) {
              const raw = weights[member.id] ?? "";
              if (!raw.trim()) continue;
              if (mode === "exact") {
                parseAmountToCents(raw);
              } else {
                const numericWeight = Number(raw);
                if (!Number.isFinite(numericWeight) || numericWeight < 0) {
                  return "invalid";
                }
              }
            }
          } catch {
            return "invalid";
          }
        }
        return "idle";
      }
      return simplePreview?.ok ? "balanced" : "invalid";
    }

    const hasItemContent = items.some(
      (item) => item.description.trim() || item.amount.trim(),
    );
    if (!hasItemContent) return "idle";
    if (itemizedPreview.ok) return "balanced";

    try {
      parseMoneyField(taxAmount);
      parseMoneyField(tipAmount);
      for (const item of items) {
        if (item.amount.trim()) parseAmountToCents(item.amount);
      }
    } catch {
      return "invalid";
    }

    const hasIncompleteItem =
      items.length === 0 ||
      items.some(
        (item) => !item.description.trim() || !item.amount.trim(),
      );
    if (hasIncompleteItem) return "incomplete";
    if (hasUnassignedItems) {
      return splitInteracted ? "invalid" : "incomplete";
    }
    return "invalid";
  })();
  const splitNeedsAttention =
    splitStatus === "incomplete" || splitStatus === "invalid";

  function assignmentSummary(item: ItemDraft) {
    const assigned = members.filter((member) =>
      item.memberIds.includes(member.id),
    );
    if (assigned.length === members.length && members.length > 0) {
      return "Everyone";
    }
    if (assigned.length === 0) return "Choose people";
    if (assigned.length === 1) return assigned[0].displayName;
    if (assigned.length === 2) {
      return `${assigned[0].displayName}, ${assigned[1].displayName}`;
    }
    return `${assigned[0].displayName} +${assigned.length - 1}`;
  }

  function assignedMembersFor(item: ItemDraft) {
    return members.filter((member) => item.memberIds.includes(member.id));
  }

  function friendlyItemizedError(message: string) {
    if (message === "Invalid amount") return "Enter a valid receipt total.";
    if (message.includes("assigned to at least one member") || message.includes("Assign \"")) {
      return "Choose who shared each receipt item.";
    }
    if (message.includes("Tax") || message.toLowerCase().includes("tax")) {
      return "Enter a valid tax amount.";
    }
    if (message.toLowerCase().includes("tip")) {
      return "Enter a valid tip amount.";
    }
    if (message.includes("description") || message.includes("name")) {
      return "Add a name for each item.";
    }
    if (message.includes("amount")) return "Enter a valid amount for each item.";
    return message;
  }

  function updateItem(key: string, update: Partial<ItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );
  }

  function addItem() {
    const key = `new-${nextItemKey.current}`;
    nextItemKey.current += 1;
    focusItemKeyRef.current = key;
    setItems((current) => [
      ...current,
      {
        key,
        description: "",
        amount: "",
        quantity: 1,
        memberIds: members.map((member) => member.id),
      },
    ]);
  }

  return (
    <form
      action={async (formData) => {
        setError(null);
        formData.set("entryMode", entryMode);

        if (entryMode === "simple") {
          if (!simplePreview?.ok) {
            setError(simplePreview?.message ?? "Fix the split before saving");
            return;
          }
          formData.set("splitMode", mode);
          formData.set(
            "splitPayload",
            JSON.stringify(
              simplePreview.splits.map((split) => ({
                memberId: split.memberId,
                amountCents: split.amountCents,
                weight: split.weight,
              })),
            ),
          );
        } else {
          if (!itemizedPreview.ok) {
            setError(itemizedPreview.message);
            return;
          }
          formData.set(
            "itemizedPayload",
            JSON.stringify({
              items: itemizedPreview.parsedItems,
              taxCents: itemizedPreview.taxCents,
              tipCents: itemizedPreview.tipCents,
            }),
          );
        }

        try {
          if (attachedReceipt) {
            formData.set("receiptImage", attachedReceipt);
          }
          await action(formData);
        } catch (actionError) {
          if (
            actionError &&
            typeof actionError === "object" &&
            "digest" in actionError &&
            typeof (actionError as { digest?: string }).digest === "string" &&
            (actionError as { digest: string }).digest.startsWith(
              "NEXT_REDIRECT",
            )
          ) {
            throw actionError;
          }
          setError(
            actionError instanceof Error ? actionError.message : "Could not save",
          );
        }
      }}
      className="min-w-0 space-y-5"
    >
      <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
        <div className="space-y-2">
          <Label htmlFor="description">What was it for?</Label>
          <Input
            id="description"
            name="description"
            required
            defaultValue={defaultValues?.description}
            placeholder="Dinner, groceries, tickets..."
            className="border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 md:text-lg"
          />
        </div>

        <div className="min-w-0 rounded-2xl bg-accent/55 px-3 py-2.5">
          <Label htmlFor="amount" className="text-accent-foreground/75">
            {entryMode === "itemized" ? "Receipt total" : "Amount"} · {currency}
          </Label>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-2xl font-semibold tracking-tight text-accent-foreground">
              {currencySymbol}
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              required
              readOnly={entryMode === "itemized"}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight text-accent-foreground shadow-none placeholder:text-accent-foreground/35 focus-visible:ring-0 md:text-2xl"
            />
          </div>
          {entryMode === "itemized" && (
            <p className="mt-1.5 text-xs text-accent-foreground/75">
              Items + tax + tip. Adjust tax and tip in split options.
            </p>
          )}
        </div>
      </section>

      <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5 text-sm">
          <span className="text-muted-foreground">Paid by</span>
          <button
            type="button"
            className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-primary/20 bg-accent px-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/75 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
            onClick={() => setPayerPickerOpen(true)}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {paidByName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{paidByName}</span>
          </button>
          <span className="text-muted-foreground">and split</span>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
              splitStatus === "invalid"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : splitStatus === "balanced"
                  ? "border-primary/20 bg-accent text-accent-foreground hover:bg-accent/75"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
            )}
            onClick={() => setSplitEditorOpen(true)}
          >
            <Scale className="size-3.5 shrink-0" />
            {entryMode === "itemized"
              ? "by item"
              : mode === "equal"
                ? "equally"
                : splitModeLabel[mode].toLowerCase()}
          </button>
        </div>

        {splitNeedsAttention && (
          <button
            type="button"
            className={cn(
              "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
              splitStatus === "invalid"
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "bg-secondary text-secondary-foreground hover:bg-muted",
            )}
            onClick={() => setSplitEditorOpen(true)}
          >
            <Users className="size-4" />
            {splitStatus === "invalid"
              ? "Check the split details"
              : "Finish setting up this split"}
            <ChevronRight className="size-4" />
          </button>
        )}

        <div className="min-w-0 space-y-2">
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            required
            defaultValue={
              defaultValues?.spentAt ?? new Date().toISOString().slice(0, 10)
            }
            className="max-w-full"
          />
        </div>
      </section>

      <input type="hidden" name="paidByMemberId" value={paidByMemberId} />

      <Sheet open={payerPickerOpen} onOpenChange={setPayerPickerOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] max-w-lg rounded-t-3xl border-border/70"
          showCloseButton={false}
        >
          <SheetHeader className="px-5 pt-5">
            <SheetTitle className="text-xl font-semibold tracking-tight">
              Choose payer
            </SheetTitle>
            <SheetDescription>
              Who paid for this expense?
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card mx-4">
            {members.map((member) => {
              const selected = member.id === paidByMemberId;
              return (
              <button
                key={member.id}
                type="button"
                className="flex min-h-16 w-full items-center gap-3 border-b border-border/65 px-4 text-left transition-colors last:border-b-0 hover:bg-muted/60"
                onClick={() => {
                  setPaidByMemberId(member.id);
                  setPayerPickerOpen(false);
                }}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {member.displayName}
                </span>
                {selected && (
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" />
                  </span>
                )}
              </button>
              );
            })}
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPayerPickerOpen(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {splitEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
            <header className="sticky top-0 z-10 flex min-h-16 items-center gap-2 border-b border-border/60 bg-background/90 px-3 py-2 backdrop-blur-xl">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back to expense"
                onClick={() => setSplitEditorOpen(false)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  Split options
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {amount.trim() || "0.00"} {currency}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSplitEditorOpen(false)}
              >
                Done
              </Button>
            </header>
            <main className="flex-1 space-y-5 px-4 py-5 pb-12">
              <section className="space-y-3">
                <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-2xl bg-muted p-1">
                  {[
                    ["equal", "Equal"],
                    ["exact", "Amounts"],
                    ["percent", "%"],
                    ["shares", "Shares"],
                    ["itemized", "Items"],
                  ].map(([value, label]) => {
                    const selected =
                      value === "itemized"
                        ? entryMode === "itemized"
                        : entryMode === "simple" && mode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={cn(
                          "flex min-h-12 min-w-[4.25rem] flex-1 items-center justify-center rounded-xl px-2 text-[11px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 sm:text-xs",
                          selected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                        )}
                        onClick={() => {
                          setSplitInteracted(true);
                          if (value === "itemized") {
                            setEntryMode("itemized");
                            setTaxAmount((current) => {
                              if (current.trim()) return current;
                              try {
                                const printedTotalCents = amount.trim()
                                  ? parseAmountToCents(amount)
                                  : 0;
                                const itemSubtotalCents = items.reduce(
                                  (sum, item) => {
                                    if (!item.amount.trim()) return sum;
                                    return (
                                      sum +
                                      lineTotalCents(
                                        parseAmountToCents(item.amount),
                                        item.quantity,
                                      )
                                    );
                                  },
                                  0,
                                );
                                if (itemSubtotalCents <= 0) return current;
                                const tip = parseMoneyField(tipAmount);
                                return formatCents(
                                  Math.max(
                                    0,
                                    printedTotalCents - itemSubtotalCents - tip,
                                  ),
                                );
                              } catch {
                                return current;
                              }
                            });
                          } else {
                            setEntryMode("simple");
                            setMode(value as SplitMode);
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="px-2 text-center">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {entryMode === "itemized"
                      ? "Split by receipt item"
                      : mode === "equal"
                        ? "Split equally"
                        : mode === "exact"
                          ? "Split by exact amounts"
                          : mode === "percent"
                            ? "Split by percentage"
                            : "Split by shares"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entryMode === "itemized"
                      ? "Add receipt items and choose who shared each one."
                      : mode === "equal"
                        ? "Choose who owes an equal share."
                        : mode === "exact"
                          ? "Enter the exact amount each person owes."
                          : mode === "percent"
                            ? "Assign percentages that add up to 100%."
                            : "Use relative shares for families, nights, or portions."}
                  </p>
                </div>
              </section>

              {entryMode === "simple" ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex min-h-14 items-center gap-3 border-b border-border/65 px-4 py-2 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    aria-label={`Include ${member.displayName}`}
                    className="size-5 accent-primary"
                    checked={!!included[member.id]}
                    onChange={(event) => {
                      setSplitInteracted(true);
                      setIncluded((current) => ({
                        ...current,
                        [member.id]: event.target.checked,
                      }));
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {member.displayName}
                  </span>
                  {mode !== "equal" && included[member.id] && (
                    <Input
                      aria-label={`${member.displayName} ${mode}`}
                      className="h-9 w-24"
                      inputMode="decimal"
                      value={weights[member.id] ?? ""}
                      onChange={(event) => {
                        setSplitInteracted(true);
                        setWeights((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }));
                      }}
                      placeholder={
                        mode === "exact"
                          ? "0.00"
                          : mode === "percent"
                            ? "%"
                            : "1"
                      }
                    />
                  )}
                  {simplePreview?.ok && included[member.id] && (
                    <span className="w-16 text-right text-xs text-muted-foreground">
                      {formatCents(
                        simplePreview.splits.find(
                          (split) => split.memberId === member.id,
                        )?.amountCents ?? 0,
                      )}
                    </span>
                  )}
                </div>
              ))}
          </div>

          {mode === "exact" && remainder != null && (
            <p
              className={cn(
                "rounded-xl px-3 py-2 text-sm",
                remainder === 0
                  ? "bg-accent text-accent-foreground"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              Remainder: {formatCents(remainder)}{" "}
              {remainder === 0 ? "(balanced)" : "(must be 0.00)"}
            </p>
          )}
          {mode === "percent" && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Percentages must sum to 100.
            </p>
          )}
          {simplePreview && !simplePreview.ok && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {simplePreview.message}
            </p>
          )}
        </div>
              ) : (
        <div className="space-y-5">
          <section className="rounded-2xl bg-accent/65 p-3.5 text-accent-foreground">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CircleDollarSign className="size-4" />
              Receipt total · {currency}
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {formatMoney(
                itemizedPreview.printedTotalCents ??
                  itemizedPreview.itemSubtotalCents,
                currency,
              )}
            </p>
            <p className="mt-1.5 text-xs text-accent-foreground/75">
              Items + tax + tip. Edit tax and tip below.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <Label>Receipt items</Label>
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-8 text-center">
                <ReceiptText className="mx-auto mb-2 size-7 text-muted-foreground" />
                <p className="text-sm font-medium">Your receipt is empty</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add each course or purchase separately.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
                {items.map((item, index) => {
                  const assigned = assignedMembersFor(item);
                  const visibleAssignees = assigned.slice(0, 4);
                  const extraAssignees = assigned.length - visibleAssignees.length;
                  let unitCents: number | null = null;
                  try {
                    if (item.amount.trim()) {
                      unitCents = parseAmountToCents(item.amount);
                    }
                  } catch {
                    unitCents = null;
                  }
                  const showLineTotal =
                    item.quantity > 1 && unitCents != null && unitCents > 0;
                  return (
                  <article
                    key={item.key}
                    className={cn(
                      "min-w-0 px-3 py-3",
                      index > 0 && "border-t border-border/65",
                    )}
                  >
                    <Label
                      htmlFor={`item-name-${item.key}`}
                      className="sr-only"
                    >
                      Item {index + 1} name
                    </Label>
                    <Textarea
                      id={`item-name-${item.key}`}
                      aria-label={`Item ${index + 1} name`}
                      rows={1}
                      className="min-h-10 w-full resize-none break-words whitespace-normal border-0 bg-transparent px-1 py-2 text-base font-medium shadow-none placeholder:text-muted-foreground focus-visible:bg-secondary/70 focus-visible:ring-0 dark:bg-transparent"
                      value={item.description}
                      ref={(element) => {
                        if (element) {
                          itemNameInputRefs.current.set(item.key, element);
                        } else {
                          itemNameInputRefs.current.delete(item.key);
                        }
                      }}
                      onChange={(event) =>
                        updateItem(item.key, {
                          description: event.target.value,
                        })
                      }
                      placeholder={`Item ${index + 1}`}
                    />

                    <div className="mt-1 flex min-w-0 items-center gap-1">
                      <Label
                        htmlFor={`item-amount-${item.key}`}
                        className="sr-only"
                      >
                        Item {index + 1} unit price
                      </Label>
                      <div className="relative min-w-0 flex-1">
                        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-muted-foreground">
                          {currencySymbol}
                        </span>
                        <Input
                          id={`item-amount-${item.key}`}
                          aria-label={`Item ${index + 1} unit price`}
                          className="h-8 border-0 bg-secondary/70 px-2 pl-5 text-right text-sm font-semibold tabular-nums shadow-none focus-visible:bg-secondary focus-visible:ring-0"
                          inputMode="decimal"
                          value={item.amount}
                          onChange={(event) =>
                            updateItem(item.key, {
                              amount: event.target.value,
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addItem();
                            }
                          }}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="flex h-8 shrink-0 items-center rounded-lg bg-secondary/70 px-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 text-muted-foreground"
                          aria-label={`Decrease quantity for item ${index + 1}`}
                          disabled={item.quantity <= 1}
                          onClick={() =>
                            updateItem(item.key, {
                              quantity: Math.max(1, item.quantity - 1),
                            })
                          }
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span
                          className="min-w-6 text-center text-[11px] font-semibold tabular-nums"
                          aria-label={`Quantity ${item.quantity}`}
                        >
                          ×{item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 text-muted-foreground"
                          aria-label={`Increase quantity for item ${index + 1}`}
                          onClick={() =>
                            updateItem(item.key, {
                              quantity: item.quantity + 1,
                            })
                          }
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-7 shrink-0 text-muted-foreground/70 hover:text-destructive"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => {
                          setItems((current) =>
                            current.filter(
                              (candidate) => candidate.key !== item.key,
                            ),
                          );
                          if (assignmentItemKey === item.key) {
                            setAssignmentItemKey(null);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {showLineTotal && unitCents != null && (
                      <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                        = {formatMoney(lineTotalCents(unitCents, item.quantity), currency)}
                      </p>
                    )}

                    <button
                      type="button"
                      className={cn(
                        "mt-1 flex h-9 w-full min-w-0 items-center gap-2 rounded-xl px-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
                        item.memberIds.length === 0 && splitInteracted
                          ? "bg-destructive/5 text-destructive"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )}
                      aria-label={`Choose who shared item ${index + 1}. Currently ${assignmentSummary(item)}`}
                      onClick={() => setAssignmentItemKey(item.key)}
                    >
                      {assigned.length > 0 ? (
                        <span className="flex shrink-0 items-center -space-x-1.5">
                          {visibleAssignees.map((member) => (
                            <span
                              key={member.id}
                              className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground ring-2 ring-card"
                              title={member.displayName}
                            >
                              {memberInitials(member.displayName)}
                            </span>
                          ))}
                          {extraAssignees > 0 && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">
                              +{extraAssignees}
                            </span>
                          )}
                        </span>
                      ) : (
                        <Users className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {assignmentSummary(item)}
                      </span>
                      <ChevronRight className="size-4 shrink-0 opacity-60" />
                    </button>
                  </article>
                  );
                })}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={addItem}
            >
              <Plus className="size-4" />
              Add another item
            </Button>
          </section>

          <section className="space-y-3">
            <div className="px-1">
              <Label>Adjustments</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tax and tip are shared in proportion to each person’s items.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
              <div className="flex min-h-14 items-center gap-3 border-b border-border/65 px-4">
                <Label htmlFor="itemized-tax" className="min-w-0 flex-1">
                  Tax
                </Label>
                <div className="relative w-[7.5rem] shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id="itemized-tax"
                    aria-label="Tax amount"
                    className="h-10 border-0 bg-secondary/70 px-2 pl-5 text-right font-semibold tabular-nums shadow-none focus-visible:bg-secondary focus-visible:ring-0"
                    inputMode="decimal"
                    value={taxAmount}
                    onChange={(event) => setTaxAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="flex min-h-10 items-center gap-3">
                  <Label htmlFor="itemized-tip" className="min-w-0 flex-1">
                    Tip
                  </Label>
                  <div className="relative w-[7.5rem] shrink-0">
                    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      id="itemized-tip"
                      aria-label="Tip amount"
                      className="h-10 border-0 bg-secondary/70 px-2 pl-5 text-right font-semibold tabular-nums shadow-none focus-visible:bg-secondary focus-visible:ring-0"
                      inputMode="decimal"
                      value={tipAmount}
                      onChange={(event) => {
                        setTipAmount(event.target.value);
                        setCustomTipPercent("");
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TIP_PERCENT_PRESETS.map((percent) => {
                    const selected =
                      itemizedPreview.itemSubtotalCents > 0 &&
                      tipCents ===
                        tipCentsFromPercent(
                          itemizedPreview.itemSubtotalCents,
                          percent,
                        );
                    return (
                      <button
                        key={percent}
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
                          selected
                            ? "border-primary/25 bg-accent text-accent-foreground"
                            : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
                        )}
                        onClick={() => {
                          setCustomTipPercent(String(percent));
                          setTipAmount(
                            formatCents(
                              tipCentsFromPercent(
                                itemizedPreview.itemSubtotalCents,
                                percent,
                              ),
                            ),
                          );
                        }}
                      >
                        {percent}%
                      </button>
                    );
                  })}
                  <div className="relative w-[4.75rem]">
                    <Input
                      aria-label="Custom tip percent"
                      className="h-8 border-0 bg-secondary/70 pr-6 text-right text-xs font-semibold tabular-nums shadow-none focus-visible:bg-secondary focus-visible:ring-0"
                      inputMode="decimal"
                      value={customTipPercent}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCustomTipPercent(value);
                        const percent = Number(value);
                        if (!Number.isFinite(percent) || percent < 0) return;
                        setTipAmount(
                          formatCents(
                            tipCentsFromPercent(
                              itemizedPreview.itemSubtotalCents,
                              percent,
                            ),
                          ),
                        );
                      }}
                      placeholder=""
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Percents apply to the items subtotal.
                </p>
              </div>
            </div>
          </section>

          <section
            className={cn(
              "rounded-2xl p-4 ring-1",
              splitStatus === "balanced"
                ? "bg-accent/70 text-accent-foreground ring-primary/15"
                : splitStatus === "invalid"
                  ? "bg-destructive/5 ring-destructive/20"
                  : "bg-card ring-foreground/[0.07]",
            )}
          >
            <div className="mb-4 flex items-start gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  splitStatus === "balanced"
                    ? "bg-primary text-primary-foreground"
                    : splitStatus === "invalid"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-secondary-foreground",
                )}
              >
                {splitStatus === "balanced" ? (
                  <CircleCheck className="size-5" />
                ) : (
                  <ReceiptText className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {splitStatus === "invalid"
                    ? hasUnassignedItems
                      ? "Choose who shared each item"
                      : "Check the receipt details"
                    : splitStatus === "balanced"
                      ? taxCents || tipCents
                        ? "Tax & tip included"
                        : "Ready to split"
                      : "Finish the receipt"}
                </h3>
                <p className="mt-0.5 text-xs opacity-70">
                  {splitStatus === "balanced"
                    ? "Tax and tip are split in proportion to each person’s items."
                    : splitStatus === "invalid"
                      ? hasUnassignedItems
                        ? "Every item needs at least one person before you can finish."
                        : "Fix item names, amounts, tax, or tip before finishing."
                      : "Add item names, amounts, and who shared each one."}
                </p>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="opacity-65">Items</span>
                <span>
                  {formatMoney(itemizedPreview.itemSubtotalCents, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-65">Tax</span>
                <span>
                  {taxCents == null ? "—" : formatMoney(taxCents, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-65">Tip</span>
                <span>
                  {tipCents == null ? "—" : formatMoney(tipCents, currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-current/10 pt-2.5 font-semibold">
                <span>Receipt total</span>
                <span>
                  {itemizedPreview.printedTotalCents == null
                    ? "—"
                    : formatMoney(itemizedPreview.printedTotalCents, currency)}
                </span>
              </div>
            </div>
          </section>

          {itemizedPreview.ok && (
            <section className="space-y-2">
              <Label className="px-1">Who owes what</Label>
              <div className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
                {itemizedPreview.calculation.splits.map((split) => (
                  <div
                    key={split.memberId}
                    className="flex min-h-12 items-center justify-between border-b border-border/65 px-4 text-sm last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
                        {memberInitials(
                          members.find((member) => member.id === split.memberId)
                            ?.displayName ?? "?",
                        )}
                      </span>
                      <span className="truncate">
                        {members.find((member) => member.id === split.memberId)
                          ?.displayName ?? "Unknown"}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(split.amountCents, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!itemizedPreview.ok && splitStatus === "invalid" && (
            <p className="rounded-xl bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {friendlyItemizedError(itemizedPreview.message)}
            </p>
          )}

          <Sheet
            open={assignmentItemKey != null}
            onOpenChange={(open) => {
              if (!open) setAssignmentItemKey(null);
            }}
          >
            <SheetContent
              side="bottom"
              className="mx-auto max-h-[88vh] max-w-lg rounded-t-3xl border-border/70"
              showCloseButton={false}
            >
              <SheetHeader className="px-5 pt-5">
                <SheetTitle className="text-xl font-semibold tracking-tight">
                  Who shared this?
                </SheetTitle>
                <SheetDescription className="break-words whitespace-normal">
                  {activeAssignmentItem?.description || "Receipt item"}
                </SheetDescription>
              </SheetHeader>
              {activeAssignmentItem && (
                <div className="overflow-y-auto px-4">
                  <button
                    type="button"
                    className={cn(
                      "mb-3 flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-colors",
                      activeAssignmentItem.memberIds.length === members.length &&
                        members.length > 0
                        ? "border-primary/25 bg-accent text-accent-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                    onClick={() => {
                      setSplitInteracted(true);
                      updateItem(activeAssignmentItem.key, {
                        memberIds: members.map((member) => member.id),
                      });
                      setAssignmentItemKey(null);
                    }}
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Users className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Shared by everyone
                      </span>
                      <span className="block text-xs opacity-70">
                        Split this course across the whole group
                      </span>
                    </span>
                    {activeAssignmentItem.memberIds.length === members.length &&
                      members.length > 0 && <Check className="size-5" />}
                  </button>

                  <div className="mb-2 flex items-center justify-between px-1">
                    <Label>Choose individually</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          {
                            setSplitInteracted(true);
                          updateItem(activeAssignmentItem.key, {
                            memberIds: members.map((member) => member.id),
                          })
                          }
                        }
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          {
                            setSplitInteracted(true);
                          updateItem(activeAssignmentItem.key, { memberIds: [] })
                          }
                        }
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
                    {members.map((member) => {
                      const selected =
                        activeAssignmentItem.memberIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          className="flex min-h-14 w-full items-center gap-3 border-b border-border/65 px-4 text-left last:border-b-0 hover:bg-muted/60"
                          onClick={() => {
                            setSplitInteracted(true);
                            updateItem(activeAssignmentItem.key, {
                              memberIds: selected
                                ? activeAssignmentItem.memberIds.filter(
                                    (id) => id !== member.id,
                                  )
                                : [...activeAssignmentItem.memberIds, member.id],
                            });
                          }}
                        >
                          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                            {member.displayName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {member.displayName}
                          </span>
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input",
                            )}
                          >
                            {selected && <Check className="size-4" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <SheetFooter className="border-t border-border/65 bg-popover p-4">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => setAssignmentItemKey(null)}
                >
                  Done
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
              )}
            </main>
          </div>
        </div>
      )}

      <section className="min-w-0 space-y-2 overflow-hidden rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes}
          placeholder="Add a note for the group"
        />
      </section>

      {children}

      {allowReceiptUpload && (
        <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
          <div className="space-y-1">
            <Label>Receipt photo (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Compressed and stored privately. Only group members can view it.
            </p>
          </div>
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            disabled={receiptBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void (async () => {
                setReceiptBusy(true);
                setError(null);
                try {
                  const compressed = await compressReceiptImage(file);
                  setAttachedReceipt(compressedReceiptToFile(compressed));
                } catch (receiptError) {
                  setError(
                    receiptError instanceof Error
                      ? receiptError.message
                      : "Could not attach that photo.",
                  );
                } finally {
                  setReceiptBusy(false);
                }
              })();
            }}
          />
          {receiptPreviewUrl ? (
            <div className="relative overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPreviewUrl}
                alt="Receipt preview"
                className="mx-auto max-h-56 w-full object-contain"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2"
                aria-label="Remove receipt photo"
                onClick={() => {
                  setAttachedReceipt(null);
                  if (receiptInputRef.current) receiptInputRef.current.value = "";
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={receiptBusy}
              onClick={() => receiptInputRef.current?.click()}
            >
              <ImageIcon className="size-4" />
              {receiptBusy ? "Compressing photo…" : "Attach receipt photo"}
            </Button>
          )}
        </section>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!canSubmit || receiptBusy}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
