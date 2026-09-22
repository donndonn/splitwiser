import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExpenseSplitDetails } from "@/components/expense-split-details";
import type { ExpenseReceiptBreakdown } from "@/lib/expense-receipt-breakdown";

export type ExpensePerson = {
  displayName: string;
  image: string | null;
};

export type ExpenseShareRow = ExpensePerson & {
  memberId: string;
  amountCents: number;
  amountLabel: string;
};

function initials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function PersonAvatar({
  person,
  size = "default",
}: {
  person: ExpensePerson;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {person.image ? (
        <AvatarImage src={person.image} alt="" />
      ) : null}
      <AvatarFallback>{initials(person.displayName)}</AvatarFallback>
    </Avatar>
  );
}

export function ExpenseReadView({
  description,
  amountLabel,
  addedByLine,
  payer,
  shares,
  notes,
  receiptBreakdown,
  hasReceipt,
  receipt,
}: {
  description: string;
  amountLabel: string;
  addedByLine: string;
  payer: ExpensePerson;
  shares: ExpenseShareRow[];
  notes?: string | null;
  receiptBreakdown: ExpenseReceiptBreakdown;
  hasReceipt: boolean;
  receipt?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight break-words">
            {description}
          </h2>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {amountLabel}
          </p>
        </div>
        {!hasReceipt ? receipt : null}
      </header>

      <p className="text-sm text-muted-foreground">{addedByLine}</p>

      {hasReceipt ? receipt : null}

      <section className="pt-1">
        <div className="flex items-center gap-3">
          <PersonAvatar person={payer} size="lg" />
          <p className="min-w-0 text-base font-medium break-words">
            {payer.displayName} paid {amountLabel}
          </p>
        </div>
        <ExpenseSplitDetails breakdown={receiptBreakdown} />
        <ul className="mt-2 ml-5 border-l border-border">
          {shares.map((share) => (
            <li
              key={share.memberId}
              className="relative flex items-center gap-2.5 py-1.5 pl-4"
            >
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-px w-3 bg-border"
              />
              <PersonAvatar person={share} size="sm" />
              <p className="min-w-0 text-sm break-words text-foreground/90">
                <span className="font-medium">{share.displayName}</span>
                <span className="text-muted-foreground">
                  {" "}
                  owes {share.amountLabel}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {notes ? (
        <p className="text-sm break-words text-muted-foreground">{notes}</p>
      ) : null}
    </div>
  );
}
