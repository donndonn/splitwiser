"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import {
  compressReceiptImage,
  compressedReceiptToFile,
} from "@/lib/ai/compress-receipt-image";
export function ReceiptAttach({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          startTransition(async () => {
            setError(null);
            try {
              const compressed = await compressReceiptImage(file);
              const formData = new FormData();
              formData.set("receiptImage", compressedReceiptToFile(compressed));
              await action(formData);
            } catch (attachError) {
              setError(
                attachError instanceof Error
                  ? attachError.message
                  : "Could not attach that photo.",
              );
            }
          });
        }}
      />
      <button
        type="button"
        aria-label="Attach receipt photo"
        disabled={pending}
        className="flex size-[4.75rem] shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-card text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-60"
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="size-5" />
      </button>
      {error ? (
        <p className="w-full text-sm text-destructive">{error}</p>
      ) : null}
    </>
  );
}
