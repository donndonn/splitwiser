"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [adjustmentsExpanded, setAdjustmentsExpanded] = useState(() =>
    [
      itemizedDefaults?.tax,
      itemizedDefaults?.tip,
      itemizedDefaults?.fee,
      itemizedDefaults?.discount,
    ].some((value) => value != null && Number(value) !== 0),
  );
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
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
      const parsedItems: ItemizedExpenseItemInput[] = items.map((item) => {
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
      printedTotalCents = parseAmountToCents(amount);
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
  const itemizedParticipantCount = new Set(
    items.flatMap((item) => item.memberIds),
  ).size;
  const splitModeLabel: Record<SplitMode, string> = {
    equal: "Equally",
    exact: "Exact amounts",
    percent: "By percentage",
    shares: "By shares",
  };
  const splitSummary =
    entryMode === "itemized"
      ? `Itemized · ${items.length} ${items.length === 1 ? "item" : "items"} · ${itemizedParticipantCount} ${itemizedParticipantCount === 1 ? "person" : "people"}`
      : `${splitModeLabel[mode]} · ${selectedMembers.length} ${selectedMembers.length === 1 ? "person" : "people"}`;
  const splitNeedsAttention =
    entryMode === "itemized" ? !itemizedPreview.ok : !simplePreview?.ok;

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

  function selectSplitMethod(
    nextEntryMode: "simple" | "itemized",
    nextSplitMode?: SplitMode,
  ) {
    setEntryMode(nextEntryMode);
    if (nextSplitMode) setMode(nextSplitMode);
    setSplitPickerOpen(false);
    setSplitEditorOpen(true);
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
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          required
          defaultValue={defaultValues?.description}
          placeholder="Dinner"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">
            {entryMode === "itemized" ? "Printed total" : "Amount"} ({currency})
          </Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            required
            defaultValue={
              defaultValues?.spentAt ??
              new Date().toISOString().slice(0, 10)
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paidByMemberId">Paid by</Label>
        <NativeSelect
          id="paidByMemberId"
          name="paidByMemberId"
          defaultValue={defaultValues?.paidByMemberId ?? defaultPaidById}
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label>Split</Label>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left"
          onClick={() => setSplitPickerOpen(true)}
        >
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {splitSummary}
            </span>
            {splitNeedsAttention && (
              <span className="block text-xs text-rose-600">
                Needs attention
              </span>
            )}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      <Sheet open={splitPickerOpen} onOpenChange={setSplitPickerOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] max-w-lg rounded-t-2xl"
        >
          <SheetHeader>
            <SheetTitle>How should this be split?</SheetTitle>
            <SheetDescription>
              Choose a method, then adjust the people or receipt items.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-2 pb-6">
            {[
              ["equal", "Equally", "Divide the total evenly"],
              ["exact", "Exact amounts", "Enter what each person owes"],
              ["percent", "By percentage", "Assign percentages totaling 100%"],
              ["shares", "By shares", "Use relative shares for each person"],
            ].map(([value, title, description]) => (
              <button
                key={value}
                type="button"
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted"
                onClick={() =>
                  selectSplitMethod("simple", value as SplitMode)
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
            <div className="my-1 border-t" />
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted"
              onClick={() => selectSplitMethod("itemized")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Itemized</span>
                <span className="block text-xs text-muted-foreground">
                  Assign individual receipt items
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <input type="hidden" name="tax" value={tax} />
      <input type="hidden" name="tip" value={tip} />
      <input type="hidden" name="fee" value={fee} />
      <input type="hidden" name="discount" value={discount} />

      {splitEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
            <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
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
                <h2 className="truncate text-sm font-semibold">
                  {entryMode === "itemized"
                    ? "Itemize expense"
                    : "Split expense"}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  Total: {amount.trim() || "0.00"} {currency}
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
            <main className="flex-1 space-y-4 px-4 py-4 pb-10">
              {entryMode === "simple" ? (
        <div className="space-y-3">
          <Label>Split</Label>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as SplitMode)}
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="equal">Equal</TabsTrigger>
              <TabsTrigger value="exact">Exact</TabsTrigger>
              <TabsTrigger value="percent">%</TabsTrigger>
              <TabsTrigger value="shares">Shares</TabsTrigger>
            </TabsList>
            <TabsContent value={mode} className="mt-3 space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <input
                    type="checkbox"
                    aria-label={`Include ${member.displayName}`}
                    className="size-4 accent-foreground"
                    checked={!!included[member.id]}
                    onChange={(event) =>
                      setIncluded((current) => ({
                        ...current,
                        [member.id]: event.target.checked,
                      }))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {member.displayName}
                  </span>
                  {mode !== "equal" && included[member.id] && (
                    <Input
                      aria-label={`${member.displayName} ${mode}`}
                      className="h-8 w-24"
                      inputMode="decimal"
                      value={weights[member.id] ?? ""}
                      onChange={(event) =>
                        setWeights((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }))
                      }
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
            </TabsContent>
          </Tabs>

          {mode === "exact" && remainder != null && (
            <p
              className={cn(
                "text-xs",
                remainder === 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              Remainder: {formatCents(remainder)}{" "}
              {remainder === 0 ? "(balanced)" : "(must be 0.00)"}
            </p>
          )}
          {mode === "percent" && (
            <p className="text-xs text-muted-foreground">
              Percentages must sum to 100.
            </p>
          )}
          {simplePreview && !simplePreview.ok && (
            <p className="text-xs text-rose-600">{simplePreview.message}</p>
          )}
        </div>
              ) : (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Receipt items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-4" />
                Add item
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Add at least one receipt item.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => {
                  const assignedNames = members
                    .filter((member) => item.memberIds.includes(member.id))
                    .map((member) => member.displayName);
                  const isExpanded = expandedItemKey === item.key;
                  return (
                    <div key={item.key} className="rounded-lg border p-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          aria-label={`Item ${index + 1} name`}
                          className="h-9 min-w-0 flex-1"
                          value={item.description}
                          onChange={(event) =>
                            updateItem(item.key, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Item name"
                        />
                        <Input
                          aria-label={`Item ${index + 1} amount`}
                          className="h-9 w-24 shrink-0"
                          inputMode="decimal"
                          value={item.amount}
                          onChange={(event) =>
                            updateItem(item.key, { amount: event.target.value })
                          }
                          placeholder="0.00"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() => {
                            setItems((current) =>
                              current.filter(
                                (candidate) => candidate.key !== item.key,
                              ),
                            );
                            if (expandedItemKey === item.key) {
                              setExpandedItemKey(null);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 max-w-full justify-start px-1 text-xs text-muted-foreground"
                        onClick={() =>
                          setExpandedItemKey(isExpanded ? null : item.key)
                        }
                      >
                        <Users className="size-4" />
                        <span className="truncate">
                          {assignedNames.length > 0
                            ? assignedNames.join(", ")
                            : "Assign people"}
                        </span>
                      </Button>
                      {isExpanded && (
                        <div className="mt-1 grid gap-2 border-t px-1 pt-2 pb-1">
                          {members.map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-foreground"
                                checked={item.memberIds.includes(member.id)}
                                onChange={(event) => {
                                  const memberIds = event.target.checked
                                    ? [...item.memberIds, member.id]
                                    : item.memberIds.filter(
                                        (id) => id !== member.id,
                                      );
                                  updateItem(item.key, { memberIds });
                                }}
                              />
                              {member.displayName}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
              aria-expanded={adjustmentsExpanded}
              onClick={() => setAdjustmentsExpanded((current) => !current)}
            >
              <span className="flex-1">Adjustments</span>
              <span className="text-xs font-normal text-muted-foreground">
                Tax, tip, fee, discount
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  adjustmentsExpanded && "rotate-180",
                )}
              />
            </button>
            <div
              className={cn(
                "grid grid-cols-2 gap-2 border-t p-3",
                !adjustmentsExpanded && "hidden",
              )}
            >
              {[
                ["Tax", "tax", tax, setTax],
                ["Tip", "tip", tip, setTip],
                ["Fee", "fee", fee, setFee],
                ["Discount", "discount", discount, setDiscount],
              ].map(([label, name, value, setter]) => (
                <div className="space-y-1" key={String(name)}>
                  <Label htmlFor={String(name)} className="text-xs">
                    {String(label)}
                  </Label>
                  <Input
                    id={String(name)}
                    className="h-9"
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

          <section className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items</span>
              <span>
                {formatMoney(itemizedPreview.itemSubtotalCents, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Calculated total</span>
              <span>
                {itemizedPreview.calculatedTotalCents == null
                  ? "—"
                  : formatMoney(
                      itemizedPreview.calculatedTotalCents,
                      currency,
                    )}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Difference</span>
              <span
                className={
                  itemizedPreview.calculatedTotalCents != null &&
                  itemizedPreview.printedTotalCents != null &&
                  itemizedPreview.calculatedTotalCents ===
                    itemizedPreview.printedTotalCents
                    ? "text-emerald-600"
                    : "text-rose-600"
                }
              >
                {itemizedPreview.calculatedTotalCents == null ||
                itemizedPreview.printedTotalCents == null
                  ? "—"
                  : formatMoney(
                      itemizedPreview.printedTotalCents -
                        itemizedPreview.calculatedTotalCents,
                      currency,
                    )}
              </span>
            </div>
          </section>

          {itemizedPreview.ok && (
            <section className="space-y-2">
              <Label>People</Label>
              {itemizedPreview.calculation.splits.map((split) => (
                <div
                  key={split.memberId}
                  className="flex justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {members.find((member) => member.id === split.memberId)
                      ?.displayName ?? "Unknown"}
                  </span>
                  <span>{formatMoney(split.amountCents, currency)}</span>
                </div>
              ))}
            </section>
          )}

          {!itemizedPreview.ok && (
            <p className="text-xs text-rose-600">{itemizedPreview.message}</p>
          )}
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes}
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

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
