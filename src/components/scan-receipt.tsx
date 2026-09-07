"use client";

import { useRef, useState, useTransition } from "react";
import {
  Camera,
  ChevronLeft,
  ImageIcon,
  ListChecks,
  Split,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ExpenseForm,
  type MemberOption,
} from "@/components/expense-form";
import { Button } from "@/components/ui/button";
import {
  applyReceiptModeAction,
  parseReceiptImageAction,
} from "@/app/g/[id]/expenses/parse-receipt-action";
import {
  compressReceiptImage,
  compressedReceiptToFile,
  dataUrlToBase64,
} from "@/lib/ai/compress-receipt-image";
import type { ParsedExpenseDefaults } from "@/lib/ai/parse-expense-text";
import type {
  ReceiptDraft,
  ReceiptParseMode,
} from "@/lib/ai/parse-receipt-image";

type Props = {
  groupId: string;
  members: MemberOption[];
  currency: string;
  defaultPaidById: string;
  action: (formData: FormData) => Promise<void>;
};

type Step = "capture" | "choose" | "form";

export function ScanReceipt({
  groupId,
  members,
  currency,
  defaultPaidById,
  action,
}: Props) {
  const [step, setStep] = useState<Step>("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const [defaults, setDefaults] = useState<ParsedExpenseDefaults | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    setPreviewUrl(null);
    setReceiptFile(null);
    setReceipt(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      try {
        const compressed = await compressReceiptImage(file);
        setPreviewUrl(compressed.dataUrl);
        setReceiptFile(compressedReceiptToFile(compressed));

        const result = await parseReceiptImageAction(groupId, {
          imageBase64: dataUrlToBase64(compressed.dataUrl),
          mimeType: compressed.mimeType,
        });

        if (!result.ok) {
          toast.error(result.error);
          setPreviewUrl(null);
          setReceiptFile(null);
          return;
        }

        setReceipt(result.receipt);
        setStep("choose");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not process that photo.",
        );
        setPreviewUrl(null);
        setReceiptFile(null);
      }
    });
  }

  function chooseMode(mode: ReceiptParseMode) {
    if (!receipt) return;
    startTransition(async () => {
      const result = await applyReceiptModeAction(groupId, receipt, mode);
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
          onClick={() => {
            setStep("choose");
            setDefaults(undefined);
          }}
        >
          <ChevronLeft className="size-4" />
          Back to options
        </Button>
        <ExpenseForm
          key={formKey}
          members={members}
          currency={currency}
          defaultPaidById={defaultPaidById}
          defaultValues={defaults}
          action={action}
          submitLabel="Add expense"
          allowReceiptUpload
          receiptFile={receiptFile}
        />
      </div>
    );
  }

  if (step === "choose" && receipt) {
    return (
      <div className="space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1 text-muted-foreground"
          onClick={() => {
            clearPhoto();
            setStep("capture");
          }}
        >
          <ChevronLeft className="size-4" />
          Retake photo
        </Button>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            How should we split this?
          </h2>
          <p className="text-sm text-muted-foreground">
            {receipt.merchant?.trim() || "Receipt"} · {currency}{" "}
            {receipt.amount.toFixed(2)}
            {receipt.items.length > 0
              ? ` · ${receipt.items.length} item${receipt.items.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="h-auto justify-start gap-3 px-4 py-4"
            disabled={pending}
            onClick={() => chooseMode("split")}
          >
            <Split className="size-5 shrink-0" />
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="font-medium">Split equally</span>
              <span className="text-xs font-normal opacity-80">
                Share the total among everyone
              </span>
            </span>
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-4"
            disabled={pending || receipt.items.length === 0}
            onClick={() => chooseMode("assign")}
          >
            <ListChecks className="size-5 shrink-0" />
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="font-medium">Assign items</span>
              <span className="text-xs font-normal text-muted-foreground">
                {receipt.items.length === 0
                  ? "No line items found on this receipt"
                  : "Decide who shared each line item"}
              </span>
            </span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Scan a receipt</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll read the total and line items, then you choose how to
          split. Photos are compressed and stored privately with the expense.
        </p>
      </div>

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="mx-auto max-h-72 w-full object-contain"
          />
          {!pending && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-2 right-2"
              aria-label="Clear photo"
              onClick={clearPhoto}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={pending}
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        disabled={pending}
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="gap-2"
          disabled={pending}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="size-4" />
          {pending ? "Reading receipt…" : "Take photo"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="size-4" />
          Choose from library
        </Button>
      </div>
    </div>
  );
}
