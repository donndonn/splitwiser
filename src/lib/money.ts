export type SplitMode = "equal" | "exact" | "percent" | "shares";

export type SplitInput = {
  memberId: string;
  /** Raw input: cents for exact, percent for percent, share count for shares/equal */
  weight: number;
};

export type SplitResult = {
  memberId: string;
  amountCents: number;
  weight: number;
};

/** Convert a decimal currency string like "12.34" to integer cents. */
export function parseAmountToCents(value: string): number {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Invalid amount");
  }
  const negative = trimmed.startsWith("-");
  const [whole, frac = ""] = trimmed.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Format integer cents as a currency string without symbol, e.g. 1234 -> "12.34". */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Format with a currency code, e.g. formatMoney(1234, "USD") -> "$12.34". */
export function formatMoney(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Allocate `totalCents` across members using the largest-remainder method
 * so that the parts always sum exactly to the total.
 */
export function allocateSplits(
  totalCents: number,
  mode: SplitMode,
  inputs: SplitInput[],
): SplitResult[] {
  if (inputs.length === 0) {
    throw new Error("At least one participant is required");
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Total must be a non-negative integer number of cents");
  }

  switch (mode) {
    case "equal":
      return allocateByWeights(
        totalCents,
        inputs.map((i) => ({ memberId: i.memberId, weight: 1 })),
      );
    case "shares":
      return allocateByWeights(totalCents, inputs);
    case "percent": {
      const sum = inputs.reduce((acc, i) => acc + i.weight, 0);
      if (Math.abs(sum - 100) > 0.0001) {
        throw new Error(`Percentages must sum to 100 (got ${sum})`);
      }
      return allocateByWeights(totalCents, inputs);
    }
    case "exact": {
      const sum = inputs.reduce((acc, i) => acc + Math.round(i.weight), 0);
      if (sum !== totalCents) {
        throw new Error(
          `Exact amounts must sum to ${totalCents} cents (got ${sum})`,
        );
      }
      return inputs.map((i) => ({
        memberId: i.memberId,
        amountCents: Math.round(i.weight),
        weight: i.weight,
      }));
    }
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown split mode: ${_exhaustive}`);
    }
  }
}

function allocateByWeights(
  totalCents: number,
  inputs: SplitInput[],
): SplitResult[] {
  const totalWeight = inputs.reduce((acc, i) => acc + i.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Weights must sum to a positive number");
  }

  const floors = inputs.map((i) => {
    const exact = (totalCents * i.weight) / totalWeight;
    const floor = Math.floor(exact);
    return {
      memberId: i.memberId,
      weight: i.weight,
      amountCents: floor,
      remainder: exact - floor,
    };
  });

  let remaining = totalCents - floors.reduce((acc, f) => acc + f.amountCents, 0);

  // Largest remainder: give leftover cents to the biggest fractional parts.
  const ordered = [...floors].sort((a, b) => b.remainder - a.remainder);
  for (const entry of ordered) {
    if (remaining <= 0) break;
    entry.amountCents += 1;
    remaining -= 1;
  }

  return floors.map(({ memberId, weight, amountCents }) => ({
    memberId,
    weight,
    amountCents,
  }));
}

/**
 * Greedy minimum-cash-flow settlement suggestions.
 * Returns transfers that bring everyone to zero net with the fewest payments.
 */
export function suggestSettlements(
  balances: { memberId: string; netCents: number }[],
): { fromMemberId: string; toMemberId: string; amountCents: number }[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ memberId: b.memberId, amount: -b.netCents }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ memberId: b.memberId, amount: b.netCents }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: {
    fromMemberId: string;
    toMemberId: string;
    amountCents: number;
  }[] = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debtors[i].memberId,
        toMemberId: creditors[j].memberId,
        amountCents: amount,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }

  return transfers;
}
