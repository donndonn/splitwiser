"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  allocateSplits,
  formatCents,
  parseAmountToCents,
  type SplitMode,
} from "@/lib/money";
import { cn } from "@/lib/utils";

export type MemberOption = {
  id: string;
  displayName: string;
};

type Props = {
  members: MemberOption[];
  currency: string;
  defaultPaidById: string;
  defaultValues?: {
    description?: string;
    amount?: string;
    paidByMemberId?: string;
    spentAt?: string;
    splitMode?: SplitMode;
    notes?: string;
    weights?: Record<string, number>;
    included?: string[];
  };
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
};

export function ExpenseForm({
  members,
  currency,
  defaultPaidById,
  defaultValues,
  action,
  submitLabel = "Save expense",
}: Props) {
  const [amount, setAmount] = useState(defaultValues?.amount ?? "");
  const [mode, setMode] = useState<SplitMode>(defaultValues?.splitMode ?? "equal");
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const m of members) {
      if (defaultValues?.included) {
        init[m.id] = defaultValues.included.includes(m.id);
      } else if (defaultValues?.weights) {
        init[m.id] = defaultValues.weights[m.id] != null;
      } else {
        init[m.id] = true;
      }
    }
    return init;
  });
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of members) {
      const w = defaultValues?.weights?.[m.id];
      if (w != null) {
        init[m.id] =
          defaultValues?.splitMode === "exact"
            ? formatCents(Math.round(w))
            : String(w);
      } else {
        init[m.id] = mode === "percent" ? "" : "1";
      }
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const selectedMembers = members.filter((m) => included[m.id]);

  const preview = useMemo(() => {
    try {
      if (!amount.trim()) return null;
      const total = parseAmountToCents(amount);
      const inputs = selectedMembers.map((m) => {
        const raw = weights[m.id] ?? "0";
        const weight =
          mode === "exact"
            ? parseAmountToCents(raw || "0")
            : Number(raw || "0");
        return { memberId: m.id, weight };
      });
      const splits = allocateSplits(total, mode, inputs);
      return { total, splits, ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Invalid split",
      };
    }
  }, [amount, mode, selectedMembers, weights]);

  const remainderLabel = useMemo(() => {
    if (!preview || !preview.ok || mode !== "exact") return null;
    const assigned = preview.splits.reduce((s, r) => s + r.amountCents, 0);
    return preview.total - assigned;
  }, [preview, mode]);

  return (
    <form
      action={async (fd) => {
        setError(null);
        if (!preview?.ok) {
          setError(preview?.message ?? "Fix the split before saving");
          return;
        }
        fd.set("splitMode", mode);
        fd.set(
          "splitPayload",
          JSON.stringify(
            preview.splits.map((s) => ({
              memberId: s.memberId,
              amountCents: s.amountCents,
              weight: s.weight,
            })),
          ),
        );
        try {
          await action(fd);
        } catch (e) {
          // Next.js redirect() throws; let it through.
          if (
            e &&
            typeof e === "object" &&
            "digest" in e &&
            typeof (e as { digest?: string }).digest === "string" &&
            (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
          ) {
            throw e;
          }
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
      className="space-y-5"
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
          <Label htmlFor="amount">Amount ({currency})</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-3">
        <Label>Split</Label>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as SplitMode)}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="equal">Equal</TabsTrigger>
            <TabsTrigger value="exact">Exact</TabsTrigger>
            <TabsTrigger value="percent">%</TabsTrigger>
            <TabsTrigger value="shares">Shares</TabsTrigger>
          </TabsList>
          <TabsContent value={mode} className="mt-3 space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={!!included[m.id]}
                  onChange={(e) =>
                    setIncluded((prev) => ({
                      ...prev,
                      [m.id]: e.target.checked,
                    }))
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.displayName}
                </span>
                {mode !== "equal" && included[m.id] && (
                  <Input
                    className="h-8 w-24"
                    inputMode="decimal"
                    value={weights[m.id] ?? ""}
                    onChange={(e) =>
                      setWeights((prev) => ({
                        ...prev,
                        [m.id]: e.target.value,
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
                {preview?.ok && included[m.id] && (
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {formatCents(
                      preview.splits.find((s) => s.memberId === m.id)
                        ?.amountCents ?? 0,
                    )}
                  </span>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>

        {mode === "exact" && remainderLabel != null && (
          <p
            className={cn(
              "text-xs",
              remainderLabel === 0
                ? "text-emerald-600"
                : "text-rose-600",
            )}
          >
            Remainder: {formatCents(remainderLabel)}{" "}
            {remainderLabel === 0 ? "(balanced)" : "(must be 0.00)"}
          </p>
        )}
        {mode === "percent" && (
          <p className="text-xs text-muted-foreground">
            Percentages must sum to 100.
          </p>
        )}
        {preview && !preview.ok && (
          <p className="text-xs text-rose-600">{preview.message}</p>
        )}
      </div>

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
        disabled={!preview?.ok}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
