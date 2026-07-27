"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
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

type Props = {
  groupId: string;
  members: MemberOption[];
  currency: string;
  defaultPaidById: string;
  action: (formData: FormData) => Promise<void>;
};

type Step = "describe" | "form";

export function DescribeExpense({
  groupId,
  members,
  currency,
  defaultPaidById,
  action,
}: Props) {
  const [step, setStep] = useState<Step>("describe");
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState<ParsedExpenseDefaults | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function goToManualForm() {
    setDefaults(undefined);
    setFormKey((key) => key + 1);
    setStep("form");
  }

  function fillFromText() {
    startTransition(async () => {
      const result = await parseExpenseTextAction(groupId, text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDefaults(result.defaults);
      setFormKey((key) => key + 1);
      setStep("form");
    });
  }

  if (step === "form") {
    return (
      <div className="space-y-4">
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
        <ExpenseForm
          key={formKey}
          members={members}
          currency={currency}
          defaultPaidById={defaultPaidById}
          defaultValues={defaults}
          action={action}
          submitLabel="Add expense"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expense-describe">Describe the expense</Label>
        <Textarea
          id="expense-describe"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_EXPENSE_TEXT_LENGTH}
          rows={5}
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
