"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  Plus,
  ReceiptText,
  Scale,
  Sparkles,
  Trash2,
  Users,
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
  calculateItemizedExpense,
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
  fee?: string;
  discount?: string;
  items: {
    description: string;
    amount: string;
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
};

type ItemDraft = {
  key: string;
  description: string;
  amount: string;
  memberIds: string[];
};

type SplitStatus = "idle" | "incomplete" | "invalid" | "balanced";

function parseAdjustment(value: string, label: string): number {
  if (!value.trim()) return 0;
  const cents = parseAmountToCents(value);
  if (cents < 0) throw new Error(`${label} cannot be negative`);
  return cents;
}

export function ExpenseForm({
  members,
  currency,
  defaultPaidById,
  defaultValues,
  action,
  submitLabel = "Save expense",
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
  const [items, setItems] = useState<ItemDraft[]>(() =>
    itemizedDefaults
      ? itemizedDefaults.items.map((item, index) => ({
          key: `saved-${index}`,
          ...item,
        }))
      : [
          {
            key: "new-0",
            description: "",
            amount: "",
            memberIds: [defaultPaidById],
          },
        ],
  );
  const [tax, setTax] = useState(itemizedDefaults?.tax ?? "");
  const [tip, setTip] = useState(itemizedDefaults?.tip ?? "");
  const [fee, setFee] = useState(itemizedDefaults?.fee ?? "");
  const [discount, setDiscount] = useState(itemizedDefaults?.discount ?? "");
  const [paidByMemberId, setPaidByMemberId] = useState(
    defaultValues?.paidByMemberId ?? defaultPaidById,
  );
  const [adjustmentsExpanded, setAdjustmentsExpanded] = useState(() =>
    [
      itemizedDefaults?.tax,
      itemizedDefaults?.tip,
      itemizedDefaults?.fee,
      itemizedDefaults?.discount,
    ].some((value) => value != null && Number(value) !== 0),
  );
  const [assignmentItemKey, setAssignmentItemKey] = useState<string | null>(
    null,
  );
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
  const [splitInteracted, setSplitInteracted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    let calculatedTotalCents: number | null = null;
    let printedTotalCents: number | null = null;
    try {
      printedTotalCents = parseAmountToCents(amount);
      const parsedItems: ItemizedExpenseItemInput[] = items.map((item, index) => {
        if (!item.amount.trim()) {
          throw new Error(
            `Enter an amount for ${item.description.trim() || `item ${index + 1}`}.`,
          );
        }
        const amountCents = parseAmountToCents(item.amount);
        itemSubtotalCents += amountCents;
        return {
          description: item.description,
          amountCents,
          memberIds: item.memberIds,
        };
      });
      const taxCents = parseAdjustment(tax, "Tax");
      const tipCents = parseAdjustment(tip, "Tip");
      const feeCents = parseAdjustment(fee, "Fee");
      const discountCents = parseAdjustment(discount, "Discount");
      calculatedTotalCents =
        itemSubtotalCents + taxCents + tipCents + feeCents - discountCents;
      const calculation = calculateItemizedExpense({
        amountCents: printedTotalCents,
        taxCents,
        tipCents,
        feeCents,
        discountCents,
        items: parsedItems,
      });
      return {
        ok: true as const,
        parsedItems,
        calculation,
        itemSubtotalCents,
        calculatedTotalCents,
        printedTotalCents,
      };
    } catch (previewError) {
      return {
        ok: false as const,
        message:
          previewError instanceof Error
            ? previewError.message
            : "Invalid itemized expense",
        itemSubtotalCents,
        calculatedTotalCents,
        printedTotalCents,
      };
    }
  }, [amount, discount, fee, items, tax, tip]);

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
  const adjustmentCents =
    itemizedPreview.calculatedTotalCents == null
      ? null
      : itemizedPreview.calculatedTotalCents -
        itemizedPreview.itemSubtotalCents;
  const itemizedDifference =
    itemizedPreview.calculatedTotalCents == null ||
    itemizedPreview.printedTotalCents == null
      ? null
      : itemizedPreview.printedTotalCents -
        itemizedPreview.calculatedTotalCents;
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
    if (!amount.trim()) return hasItemContent ? "incomplete" : "idle";
    if (itemizedPreview.ok) return "balanced";

    try {
      parseAmountToCents(amount);
      for (const item of items) {
        if (item.amount.trim()) parseAmountToCents(item.amount);
      }
      parseAdjustment(tax, "Tax");
      parseAdjustment(tip, "Tip");
      parseAdjustment(fee, "Fee");
      parseAdjustment(discount, "Discount");
    } catch {
      return "invalid";
    }

    const hasIncompleteItem =
      items.length === 0 ||
      items.some(
        (item) => !item.description.trim() || !item.amount.trim(),
      );
    if (hasIncompleteItem) return "incomplete";
    if (
      splitInteracted &&
      items.some((item) => item.memberIds.length === 0)
    ) {
      return "invalid";
    }
    if (itemizedDifference != null && itemizedDifference !== 0) {
      return "incomplete";
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
      return "Shared by everyone";
    }
    if (assigned.length === 0) return "Choose people";
    if (assigned.length === 1) return assigned[0].displayName;
    return `${assigned[0].displayName} +${assigned.length - 1}`;
  }

  function friendlyItemizedError(message: string) {
    if (message === "Invalid amount") return "Enter a valid receipt total.";
    if (message.includes("assigned to at least one member")) {
      return "Choose who shared each receipt item.";
    }
    if (message.includes("description")) return "Add a name for each item.";
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
    setItems((current) => [
      ...current,
      {
        key,
        description: "",
        amount: "",
        memberIds: [defaultPaidById],
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
            JSON.stringify({ items: itemizedPreview.parsedItems }),
          );
        }

        try {
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
      className="space-y-5"
    >
      <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
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

        <div className="rounded-2xl bg-accent/55 px-4 py-4">
          <Label htmlFor="amount" className="text-accent-foreground/75">
            {entryMode === "itemized" ? "Receipt total" : "Amount"} · {currency}
          </Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-semibold tracking-tight text-accent-foreground">
              {currencySymbol}
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-tight text-accent-foreground shadow-none placeholder:text-accent-foreground/35 focus-visible:ring-0 md:text-3xl"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
        <div className="flex flex-wrap items-center justify-center gap-2 py-1 text-sm">
          <span className="text-muted-foreground">Paid by</span>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-accent px-3 font-semibold text-accent-foreground transition-colors hover:bg-accent/75 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
            onClick={() => setPayerPickerOpen(true)}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {paidByName.slice(0, 1).toUpperCase()}
            </span>
            {paidByName}
          </button>
          <span className="text-muted-foreground">and split</span>
          <button
            type="button"
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
              splitStatus === "invalid"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : splitStatus === "balanced"
                  ? "border-primary/20 bg-accent text-accent-foreground hover:bg-accent/75"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
            )}
            onClick={() => setSplitEditorOpen(true)}
          >
            <Scale className="size-4" />
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

        <div className="space-y-2">
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            required
            defaultValue={
              defaultValues?.spentAt ?? new Date().toISOString().slice(0, 10)
            }
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

      <input type="hidden" name="tax" value={tax} />
      <input type="hidden" name="tip" value={tip} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="discount" value={discount} />

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
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-tight">
                {currencySymbol}
              </span>
              <Input
                aria-label={`Receipt total in ${currency}`}
                className="h-auto border-0 bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight text-accent-foreground shadow-none placeholder:text-accent-foreground/35 focus-visible:ring-0 md:text-2xl"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <p className="mt-1.5 text-xs text-accent-foreground/75">
              Enter the final total printed on the receipt.
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
                {items.map((item, index) => (
                  <article
                    key={item.key}
                    className={cn(
                      "min-w-0 px-3 py-2.5",
                      index > 0 && "border-t border-border/65",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Label
                        htmlFor={`item-name-${item.key}`}
                        className="sr-only"
                      >
                        Item {index + 1} name
                      </Label>
                      <Input
                        id={`item-name-${item.key}`}
                        aria-label={`Item ${index + 1} name`}
                        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none placeholder:text-muted-foreground focus-visible:bg-secondary/70 focus-visible:ring-0"
                        value={item.description}
                        onChange={(event) =>
                          updateItem(item.key, {
                            description: event.target.value,
                          })
                        }
                        placeholder={`Item ${index + 1}`}
                      />

                      <Label
                        htmlFor={`item-amount-${item.key}`}
                        className="sr-only"
                      >
                        Item {index + 1} amount
                      </Label>
                      <div className="relative w-[5.5rem] shrink-0">
                        <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-xs text-muted-foreground">
                          {currencySymbol}
                        </span>
                        <Input
                          id={`item-amount-${item.key}`}
                          aria-label={`Item ${index + 1} amount`}
                          className="h-10 border-0 bg-transparent px-1 pl-4 text-right font-semibold shadow-none focus-visible:bg-secondary/70 focus-visible:ring-0"
                          inputMode="decimal"
                          value={item.amount}
                          onChange={(event) =>
                            updateItem(item.key, {
                              amount: event.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
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
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 flex h-9 w-full min-w-0 items-center gap-2 rounded-xl px-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
                        item.memberIds.length === 0 && splitInteracted
                          ? "border-destructive/35 bg-destructive/5 text-destructive"
                          : "text-foreground hover:bg-secondary/70",
                      )}
                      aria-label={`Choose who shared item ${index + 1}. Currently ${assignmentSummary(item)}`}
                      onClick={() => setAssignmentItemKey(item.key)}
                    >
                      <Users className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {assignmentSummary(item)}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </article>
                ))}
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

          <section className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold"
              aria-expanded={adjustmentsExpanded}
              onClick={() => setAdjustmentsExpanded((current) => !current)}
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">Adjustments</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Tax, tip, fees and discounts
                </span>
              </span>
              {adjustmentCents != null && adjustmentCents !== 0 && (
                <span className="text-xs text-muted-foreground">
                  {adjustmentCents > 0 ? "+" : ""}
                  {formatMoney(adjustmentCents, currency)}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  adjustmentsExpanded && "rotate-180",
                )}
              />
            </button>
            <div
              className={cn(
                "grid grid-cols-2 gap-3 border-t border-border/65 p-4",
                !adjustmentsExpanded && "hidden",
              )}
            >
              {[
                ["Tax", "tax", tax, setTax],
                ["Tip", "tip", tip, setTip],
                ["Fee", "fee", fee, setFee],
                ["Discount", "discount", discount, setDiscount],
              ].map(([label, name, value, setter]) => (
                <div className="space-y-1.5" key={String(name)}>
                  <Label htmlFor={String(name)} className="text-xs">
                    {String(label)}
                  </Label>
                  <Input
                    id={String(name)}
                    inputMode="decimal"
                    value={String(value)}
                    onChange={(event) =>
                      (setter as (next: string) => void)(event.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>
              ))}
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
                    ? "Check the receipt details"
                    : itemizedDifference == null
                    ? "Finish the receipt"
                    : splitStatus === "balanced"
                      ? "Balanced"
                      : itemizedDifference > 0
                        ? `${formatMoney(itemizedDifference, currency)} left to add`
                        : itemizedDifference < 0
                          ? `Items are ${formatMoney(-itemizedDifference, currency)} over`
                          : "Finish the item details"}
                </h3>
                <p className="mt-0.5 text-xs opacity-70">
                  {splitStatus === "balanced"
                    ? "Everything matches the receipt total."
                    : splitStatus === "invalid"
                      ? "Fix the highlighted value before finishing."
                    : "Items and adjustments should match the receipt total."}
                </p>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="opacity-65">Items subtotal</span>
                <span>{formatMoney(itemizedPreview.itemSubtotalCents, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-65">Adjustments</span>
                <span>
                  {adjustmentCents == null
                    ? "—"
                    : formatMoney(adjustmentCents, currency)}
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
                    <span>
                      {members.find((member) => member.id === split.memberId)
                        ?.displayName ?? "Unknown"}
                    </span>
                    <span className="font-semibold">
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
                <SheetDescription className="truncate">
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
                    onClick={() =>
                      {
                        setSplitInteracted(true);
                      updateItem(activeAssignmentItem.key, {
                        memberIds: members.map((member) => member.id),
                      })
                      }
                    }
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Sparkles className="size-5" />
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

      <section className="space-y-2 rounded-2xl bg-card p-4 shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes}
          placeholder="Add a note for the group"
        />
      </section>

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!canSubmit}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
