import { ReceiptPhotoDisclosure } from "@/components/receipt-photo-disclosure";
import { receiptImageApiPath } from "@/lib/receipt-blob";
import { cn, groupedListClass } from "@/lib/utils";

type ReceiptSource = {
  expenseId: string;
  /** Image URL. Defaults to the member-only receipt route. */
  src?: string;
  caption?: string;
};

function ReceiptFigure({
  expenseId,
  src,
  caption = "Receipt photo · visible to group members only",
  className,
}: ReceiptSource & { className?: string }) {
  return (
    <figure className={className}>
      {/* Auth'd same-origin route — next/image remote config is not needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src ?? receiptImageApiPath(expenseId)}
        alt="Receipt"
        className="mx-auto max-h-80 w-full rounded-xl bg-muted object-contain"
      />
      <figcaption className="mt-2 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

export function ReceiptPhoto({
  collapsible = true,
  ...source
}: ReceiptSource & {
  collapsible?: boolean;
}) {
  if (!collapsible) {
    return (
      <ReceiptFigure
        {...source}
        className={cn(groupedListClass, "min-w-0 p-4")}
      />
    );
  }

  return (
    <ReceiptPhotoDisclosure>
      <ReceiptFigure {...source} />
    </ReceiptPhotoDisclosure>
  );
}
