import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import {
  formatBalanceContext,
  viewerBalanceContext,
} from "@/lib/balance-context";
import { viewerExpenseShare } from "@/lib/expense-row";
import { formatMoney } from "@/lib/money";
import { paymentActionLabel } from "@/lib/settlement-copy";
import { formatExpenseDateParts } from "@/lib/settle-marker";
import { getSharedGroupView, type SharedGroupView } from "@/lib/share-link";
import { cn, groupedListClass } from "@/lib/utils";
import { listVenmoPayLinks } from "@/lib/venmo";
import { VenmoPayButton } from "./venmo-pay-button";

// The token is the only secret: keep it out of search results and out of
// the Referer header sent to Venmo.
export const metadata: Metadata = {
  title: "Shared group",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function balanceTone(netCents: number) {
  return netCents > 0
    ? "text-balance-positive"
    : netCents < 0
      ? "text-balance-negative"
      : "text-muted-foreground";
}

function memberBalanceLabel(netCents: number, currency: string) {
  if (netCents === 0) return "Settled up";
  return netCents > 0
    ? `Is owed ${formatMoney(netCents, currency)}`
    : `Owes ${formatMoney(-netCents, currency)}`;
}

export default async function SharedGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ me?: string | string[] }>;
}) {
  const [{ token }, { me }] = await Promise.all([params, searchParams]);
  const view = await getSharedGroupView(db, token);
  if (!view) notFound();

  const viewer =
    typeof me === "string"
      ? (view.members.find((m) => m.id === me) ?? null)
      : null;
  const base = `/s/${token}`;

  return (
    <AppShell title={view.group.name}>
      <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Eye className="size-3.5" aria-hidden />
        View-only link. Nothing here can be changed.
      </p>

      {viewer ? (
        <ViewerSummary view={view} viewerId={viewer.id} base={base} />
      ) : (
        <MemberPicker view={view} base={base} />
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">
        Balances
      </h2>
      <div className={cn(groupedListClass, "mb-6")}>
        <ul className="divide-y divide-border">
          {view.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate text-sm font-medium">
                {m.displayName}
                {m.id === viewer?.id ? (
                  <span className="text-muted-foreground"> (you)</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm tabular-nums",
                  balanceTone(m.netCents),
                )}
              >
                {memberBalanceLabel(m.netCents, view.group.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Expenses
      </h2>
      <ExpenseList view={view} viewerId={viewer?.id ?? null} />

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Want to add expenses yourself? Ask the group admin for an invite to
        Splitwiser.
      </p>
    </AppShell>
  );
}

function MemberPicker({ view, base }: { view: SharedGroupView; base: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Which one are you?</CardTitle>
        <CardDescription>
          Pick your name to see what you owe or are owed.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {view.members.map((m) => (
            <Link
              key={m.id}
              href={`${base}?me=${encodeURIComponent(m.id)}`}
              replace
              scroll={false}
              className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              {m.displayName}
            </Link>
          ))}
        </div>
      </CardHeader>
    </Card>
  );
}

function ViewerSummary({
  view,
  viewerId,
  base,
}: {
  view: SharedGroupView;
  viewerId: string;
  base: string;
}) {
  const { currency } = view.group;
  const viewer = view.members.find((m) => m.id === viewerId)!;
  const nameById = new Map(view.members.map((m) => [m.id, m.displayName]));
  const net = viewer.netCents;
  const mine = view.suggestions.filter(
    (s) =>
      s.amountCents > 0 &&
      (s.fromMemberId === viewerId || s.toMemberId === viewerId),
  );
  const payLinks = new Map(
    listVenmoPayLinks({
      currency,
      groupName: view.group.name,
      currentMemberId: viewerId,
      suggestions: mine,
      venmoUsernameByMemberId: view.venmoUsernameByMemberId,
    }).map((link) => [link.toMemberId, link]),
  );

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>Hi {viewer.displayName}</span>
          <Link
            href={base}
            replace
            scroll={false}
            className="text-xs underline underline-offset-2"
          >
            Not you?
          </Link>
        </CardDescription>
        <CardTitle className={cn("text-2xl", net !== 0 && balanceTone(net))}>
          {net === 0
            ? "All settled up"
            : net > 0
              ? `You're owed ${formatMoney(net, currency)}`
              : `You owe ${formatMoney(-net, currency)}`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatBalanceContext(
            viewerBalanceContext(
              viewerId,
              view.members.map((m) => ({ memberId: m.id, netCents: m.netCents })),
            ),
          )}
        </p>
        {mine.length > 0 ? (
          <ul className="space-y-2 pt-3">
            {mine.map((s) => {
              const link =
                s.fromMemberId === viewerId ? payLinks.get(s.toMemberId) : null;
              return (
                <li
                  key={`${s.fromMemberId}-${s.toMemberId}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm">
                    {paymentActionLabel(
                      s.fromMemberId,
                      s.toMemberId,
                      viewerId,
                      nameById.get(s.fromMemberId) ?? "Someone",
                      nameById.get(s.toMemberId) ?? "someone",
                    )}{" "}
                    <span className="font-semibold tabular-nums">
                      {formatMoney(s.amountCents, currency)}
                    </span>
                  </span>
                  {link ? (
                    <VenmoPayButton
                      appUrl={link.appUrl}
                      webUrl={link.webUrl}
                      label="Pay on Venmo"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardHeader>
    </Card>
  );
}

const shareToneClass = {
  borrowed: "text-balance-negative",
  lent: "text-balance-positive",
} as const;

const shareLabel = {
  borrowed: "You owe",
  lent: "Owes you",
} as const;

function ExpenseList({
  view,
  viewerId,
}: {
  view: SharedGroupView;
  viewerId: string | null;
}) {
  const { currency } = view.group;
  if (view.expenses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No expenses yet</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={groupedListClass}>
      <ul className="divide-y divide-border">
        {view.expenses.map((e) => {
          const date = formatExpenseDateParts(e.spentAt);
          const paidByViewer = e.paidByMemberId === viewerId;
          const share = viewerId
            ? viewerExpenseShare({
                amountCents: e.amountCents,
                paidByViewer,
                viewerShareCents: e.shares[viewerId] ?? 0,
              })
            : ({ kind: "none" } as const);
          return (
            <li key={e.id} className="flex items-center gap-3 px-3 py-3">
              <div className="flex w-9 shrink-0 flex-col items-center leading-none text-muted-foreground">
                <span className="text-[11px] font-medium">{date.month}</span>
                <span className="mt-1 text-base font-medium tabular-nums">
                  {date.day}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {e.description}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {paidByViewer ? "You" : e.paidByName} paid{" "}
                  {formatMoney(e.amountCents, currency)}
                </p>
              </div>
              {share.kind === "borrowed" || share.kind === "lent" ? (
                <div
                  className={cn(
                    "shrink-0 text-right leading-tight",
                    shareToneClass[share.kind],
                  )}
                >
                  <p className="text-[11px] font-medium">
                    {shareLabel[share.kind]}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(share.amountCents, currency)}
                  </p>
                </div>
              ) : share.kind === "settled" ? (
                <p className="shrink-0 text-xs font-medium text-muted-foreground">
                  Settled
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
