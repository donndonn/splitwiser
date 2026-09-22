import { ReceiptPhotoDisclosure } from "@/components/receipt-photo-disclosure";
import { receiptImageApiPath } from "@/lib/receipt-blob";
import { cn, groupedListClass } from "@/lib/utils";

function ReceiptFigure({
  expenseId,
  className,
}: {
  expenseId: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      {/* Auth'd same-origin route — next/image remote config is not needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receiptImageApiPath(expenseId)}
        alt="Receipt"
        className="mx-auto max-h-80 w-full rounded-xl bg-muted object-contain"
      />
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Receipt photo · visible to group members only
      </figcaption>
    </figure>
  );
}

export function ReceiptPhoto({
  expenseId,
  collapsible = true,
}: {
  expenseId: string;
  collapsible?: boolean;
}) {
  if (!collapsible) {
    return (
      <ReceiptFigure
        expenseId={expenseId}
        className={cn(groupedListClass, "min-w-0 p-4")}
      />
    );
  }

  return (
    <ReceiptPhotoDisclosure>
      <ReceiptFigure expenseId={expenseId} />
    </ReceiptPhotoDisclosure>
  );
}
