"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AddPersonSheet,
  type AddPersonFriend,
} from "@/components/add-person-sheet";
import {
  ExpenseForm,
  type MemberOption,
} from "@/components/expense-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseExpenseTextAction } from "@/app/g/[id]/expenses/parse-expense-action";
import {
  MAX_EXPENSE_TEXT_LENGTH,
  type ParsedExpenseDefaults,
} from "@/lib/ai/parse-expense-text";
import { cn } from "@/lib/utils";

type Props = {
  groupId: string;
  members: MemberOption[];
  currency: string;
  defaultPaidById: string;
  /** Admins can add friends or names to the group from here. */
  canAddPeople: boolean;
  /** Friends not yet in the group. */
  friends: AddPersonFriend[];
  action: (formData: FormData) => Promise<void>;
};

type Step = "describe" | "form";

export function DescribeExpense({
  groupId,
  members,
  currency,
  defaultPaidById,
  canAddPeople,
  friends,
  action,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("describe");
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState<ParsedExpenseDefaults | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  // Added here but not yet in the refreshed server props.
  const [addedMembers, setAddedMembers] = useState<MemberOption[]>([]);
  // Track who's off, so people added later start selected.
  const [deselected, setDeselected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState<string | undefined>();

  const allMembers = [
    ...members,
    ...addedMembers.filter((added) => !members.some((m) => m.id === added.id)),
  ];
  const others = allMembers.filter((member) => member.id !== defaultPaidById);
  const selectedOthers = others.filter(
    (member) => !deselected.includes(member.id),
  );
  const selectedIds = [defaultPaidById, ...selectedOthers.map((m) => m.id)];
  const unmatchedNames = defaults?.unmatchedNames ?? [];

  function toggle(memberId: string) {
    setDeselected((current) => {
      if (current.includes(memberId)) {
        return current.filter((id) => id !== memberId);
      }
      // Keep at least one other person in the split.
      if (selectedOthers.length <= 1) return current;
      return [...current, memberId];
    });
  }

  function openAddPerson(name?: string) {
    setAddName(name);
    setAddOpen(true);
  }

  function handleAdded(member: MemberOption) {
    setAddedMembers((current) => [...current, member]);
    setDeselected((current) => current.filter((id) => id !== member.id));
    router.refresh();
    if (step !== "form" || !defaults) return;
    // Put the new person into the filled form and drop the matching name.
    const name = addName?.trim().toLowerCase();
    setDefaults({
      ...defaults,
      ...(defaults.entryMode === "simple"
        ? { included: [...defaults.included, member.id] }
        : {}),
      unmatchedNames: defaults.unmatchedNames?.filter(
        (unmatched) =>
          unmatched.toLowerCase() !== name &&
          unmatched.toLowerCase() !== member.displayName.toLowerCase(),
      ),
    });
    setFormKey((key) => key + 1);
  }

  function goToManualForm() {
    setDefaults(undefined);
    setFormKey((key) => key + 1);
    setStep("form");
  }

  function fillFromText() {
    startTransition(async () => {
      const result = await parseExpenseTextAction(groupId, text, selectedIds);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDefaults(result.defaults);
      setFormKey((key) => key + 1);
      setStep("form");
    });
  }

  const addPersonSheet = canAddPeople ? (
    <AddPersonSheet
      open={addOpen}
      onOpenChange={setAddOpen}
      groupId={groupId}
      friends={friends}
      initialName={addName}
      onAdded={handleAdded}
    />
  ) : null;

  if (step === "form") {
    return (
      <div className="space-y-4">
        {addPersonSheet}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1 text-muted-foreground"
          onClick={() => setStep("describe")}
        >
          <ChevronLeft className="size-4" />
          Back to description
        </Button>
        {unmatchedNames.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <p className="text-sm">
              {formatNames(unmatchedNames)}{" "}
              {unmatchedNames.length === 1 ? "isn't" : "aren't"} in this group
              yet, so the split leaves them out.
            </p>
            {canAddPeople ? (
              <div className="flex flex-wrap gap-2">
                {unmatchedNames.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                    onClick={() => openAddPerson(name)}
                  >
                    <Plus className="size-4" />
                    Add {name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ask a group admin to add them.
              </p>
            )}
          </div>
        ) : null}
        <ExpenseForm
          key={formKey}
          members={allMembers}
          currency={currency}
          defaultPaidById={defaultPaidById}
          defaultValues={
            defaults ?? { entryMode: "simple", included: selectedIds }
          }
          action={action}
          submitLabel="Add expense"
          allowReceiptUpload
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {addPersonSheet}
      <div className="space-y-2">
        <p className="text-sm font-medium" id="split-with-label">
          Split with
        </p>
        <div
          role="group"
          aria-labelledby="split-with-label"
          className="flex flex-wrap gap-2"
        >
          {others.map((member) => {
            const selected = !deselected.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => toggle(member.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {selected ? <Check className="size-3.5" /> : null}
                {member.displayName}
              </button>
            );
          })}
          {canAddPeople ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => openAddPerson()}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <Plus className="size-3.5" />
              Add person
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expense-describe">Describe the expense</Label>
        <Textarea
          id="expense-describe"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_EXPENSE_TEXT_LENGTH}
          rows={8}
          className="min-h-48"
          placeholder={`e.g. Uber $24 split with Sam\n\nor lunch total 100 — I had burger 25, Alex salad 26, Bob pasta 27`}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll fill the form for you to review before saving.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="gap-2"
          disabled={pending || !text.trim()}
          onClick={fillFromText}
        >
          <Sparkles className="size-4" />
          {pending ? "Filling form…" : "Fill form"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={goToManualForm}
        >
          Enter manually
        </Button>
      </div>

      <Button
        asChild
        type="button"
        variant="ghost"
        className="w-full gap-2 text-muted-foreground"
      >
        <Link href={`/g/${groupId}/expenses/scan`}>
          <Camera className="size-4" />
          Scan receipt
        </Link>
      </Button>
    </div>
  );
}

function formatNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
