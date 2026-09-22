export type BalanceNet = {
  netCents: number;
};

export type SettlePromptDismissal = {
  activityWatermark: Date;
};

const ZERO_CENT_EPSILON = 1;

export function areAllBalancesZero(balances: BalanceNet[]): boolean {
  return balances.every((row) => Math.abs(row.netCents) < ZERO_CENT_EPSILON);
}

/**
 * Recent uses createdAt vs the marker, not spentAt.
 * spentAt is a calendar date stored at noon, so a same-day expense added
 * after confirm would otherwise disappear from Recent.
 */
export function isExpenseInOpenPeriod(
  createdAt: Date,
  settledAt: Date | null,
): boolean {
  if (!settledAt) return true;
  return createdAt.getTime() > settledAt.getTime();
}

export function isDismissalActive(
  dismissal: SettlePromptDismissal | null,
  currentWatermark: Date | null,
): boolean {
  if (!dismissal) return false;
  if (!currentWatermark) return true;
  return currentWatermark.getTime() <= dismissal.activityWatermark.getTime();
}

export function shouldPromptMarkAsSettled(input: {
  fullySettled: boolean;
  openPeriodExpenseCount: number;
  dismissed: boolean;
}): boolean {
  return (
    input.fullySettled &&
    input.openPeriodExpenseCount > 0 &&
    !input.dismissed
  );
}

export function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function formatExpenseDateLabel(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

/** Month above day for a recent-expense row, e.g. Sep / 08. */
export function formatExpenseDateParts(
  date: Date,
  locale?: string,
): { month: string; day: string } {
  return {
    month: date.toLocaleDateString(locale, { month: "short" }),
    day: date.toLocaleDateString(locale, { day: "2-digit" }),
  };
}
