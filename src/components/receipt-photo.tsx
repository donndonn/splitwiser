import { receiptImageApiPath } from "@/lib/receipt-blob";

export function ReceiptPhoto({ expenseId }: { expenseId: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl bg-card shadow-sm shadow-foreground/[0.04] ring-1 ring-foreground/[0.07]">
      {/* Auth'd same-origin route — next/image remote config is not needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receiptImageApiPath(expenseId)}
        alt="Receipt"
        className="mx-auto max-h-80 w-full bg-muted object-contain"
      />
      <figcaption className="px-4 py-2 text-xs text-muted-foreground">
        Receipt photo · visible to group members only
      </figcaption>
    </figure>
  );
}
