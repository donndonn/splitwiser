import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  expandItemPortions,
  calculateItemizedExpense,
  lineTotalCents,
  type PortionedItemInput,
} from "./itemized-expense";
import {
  allocateSplits,
  suggestSettlements,
  type SplitInput,
  type SplitMode,
} from "./money";

/**
 * Property: shares of an expense are whole non-negative cents that add up
 * to the expense (items + tax + tip for an itemized check), soft-deleted
 * expenses do not move anyone's net, every group's nets add up to zero,
 * and settle-up suggestions clear those nets.
 *
 * Bounds and the ledger mirror of `netDeltaSource` are documented in
 * `.cursor/skills/verify-formal-balances/SKILL.md`. Run `npm run verify:balances`.
 *
 * Outside these bounds, `allocateSplits(100, "shares", weights 1e308 and 1)`
 * returns Infinity for the huge share. That input cannot be saved:
 * `parseSplitPayload` rejects a non-integer amount, and JSON cannot carry
 * Infinity. It is not part of this check.
 */

/** `EXPENSE_DRAFT_LIMITS.amount` (dollars) times 100. See parse-expense-text.ts. */
const MAX_TOTAL_CENTS = 100_000_000;
/** `EXPENSE_DRAFT_LIMITS.participants`. */
const MAX_PARTICIPANTS = 50;

const PROPERTY_RUNS = 300;
const PROPERTY_SEED = 20261103;

type Share = { memberId: string; amountCents: number };

type PostedExpense = {
  payerId: string;
  amountCents: number;
  splits: Share[];
  deletedAt: boolean;
};

type PostedSettlement = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

type SimpleExpenseInput = {
  kind: "simple";
  payerId: string;
  totalCents: number;
  mode: SplitMode;
  inputs: SplitInput[];
  deletedAt: boolean;
};

type ItemizedExpenseCase = {
  kind: "itemized";
  payerId: string;
  taxCents: number;
  tipCents: number;
  items: PortionedItemInput[];
  deletedAt: boolean;
};

type ExpenseInput = SimpleExpenseInput | ItemizedExpenseCase;

type SettlementInput = PostedSettlement;

type Ledger = {
  memberIds: string[];
  expenses: ExpenseInput[];
  settlements: SettlementInput[];
};

function fail(message: string): never {
  throw new Error(message);
}

function formatShares(splits: Share[]): string {
  return splits.map((split) => `${split.memberId}=${split.amountCents}`).join(", ");
}

function assertShares(totalCents: number, splits: Share[], label: string) {
  for (const split of splits) {
    if (!Number.isInteger(split.amountCents) || split.amountCents < 0) {
      fail(
        `${label}: ${split.memberId} has share ${split.amountCents}, which is not a whole non-negative number of cents. Shares: ${formatShares(splits)}.`,
      );
    }
  }
  const sum = splits.reduce((total, split) => total + split.amountCents, 0);
  if (sum !== totalCents) {
    fail(
      `${label}: shares add up to ${sum} cents, but the expense is ${totalCents} cents. Shares: ${formatShares(splits)}.`,
    );
  }
}

/**
 * Deltas from `netDeltaSource` in src/lib/balances.ts.
 * `activeExpense()` in src/lib/expenses.ts drops rows with `deleted_at` set,
 * on both the payer arm and the split arm.
 *
 * Live expense: payer += amountCents, each split member -= amountCents.
 * Settlement: from += amountCents, to -= amountCents.
 * A member with no delta is omitted, matching the GROUP BY in `queryNets`.
 */
function memberNets(
  expenses: readonly PostedExpense[],
  settlements: readonly PostedSettlement[],
): Map<string, number> {
  const nets = new Map<string, number>();
  const add = (memberId: string, delta: number) => {
    nets.set(memberId, (nets.get(memberId) ?? 0) + delta);
  };

  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    add(expense.payerId, expense.amountCents);
    for (const split of expense.splits) add(split.memberId, -split.amountCents);
  }
  for (const settlement of settlements) {
    add(settlement.fromMemberId, settlement.amountCents);
    add(settlement.toMemberId, -settlement.amountCents);
  }
  return nets;
}

function netsEqual(left: Map<string, number>, right: Map<string, number>): boolean {
  const ids = new Set([...left.keys(), ...right.keys()]);
  for (const id of ids) {
    if ((left.get(id) ?? 0) !== (right.get(id) ?? 0)) return false;
  }
  return true;
}

function assertClears(nets: Map<string, number>, label: string) {
  const balances = [...nets.entries()].map(([memberId, netCents]) => ({
    memberId,
    netCents,
  }));
  const sum = balances.reduce((total, row) => total + row.netCents, 0);
  if (sum !== 0) {
    fail(
      `${label}: nets add up to ${sum} cents, not 0. Nets: ${formatShares(balances.map((row) => ({ memberId: row.memberId, amountCents: row.netCents })))}.`,
    );
  }

  const transfers = suggestSettlements(balances);
  const known = new Set(balances.map((row) => row.memberId));
  const after = new Map(nets);
  for (const transfer of transfers) {
    if (!Number.isInteger(transfer.amountCents) || transfer.amountCents <= 0) {
      fail(
        `${label}: suggestion ${transfer.fromMemberId} → ${transfer.toMemberId} is ${transfer.amountCents} cents, not a positive whole number.`,
      );
    }
    if (transfer.fromMemberId === transfer.toMemberId) {
      fail(`${label}: suggestion pays ${transfer.fromMemberId} to themselves.`);
    }
    if (!known.has(transfer.fromMemberId) || !known.has(transfer.toMemberId)) {
      fail(
        `${label}: suggestion mentions ${transfer.fromMemberId} → ${transfer.toMemberId}, who is not in the nets.`,
      );
    }
    after.set(
      transfer.fromMemberId,
      (after.get(transfer.fromMemberId) ?? 0) + transfer.amountCents,
    );
    after.set(
      transfer.toMemberId,
      (after.get(transfer.toMemberId) ?? 0) - transfer.amountCents,
    );
  }

  for (const [memberId, netCents] of after) {
    if (netCents !== 0) {
      fail(
        `${label}: after recording the suggestions, ${memberId} is at ${netCents} cents. Suggestions: ${JSON.stringify(transfers)}. Before: ${JSON.stringify(balances)}.`,
      );
    }
  }
}

function assertGroupMembers(ledger: Ledger, memberId: string, label: string) {
  if (!ledger.memberIds.includes(memberId)) {
    fail(`${label}: ${memberId} is not in this group (${ledger.memberIds.join(", ")}).`);
  }
}

function postSimple(expense: SimpleExpenseInput, label: string): PostedExpense {
  const splits = allocateSplits(expense.totalCents, expense.mode, expense.inputs);
  if (splits.length !== expense.inputs.length) {
    fail(
      `${label}: allocateSplits returned ${splits.length} shares for ${expense.inputs.length} people.`,
    );
  }
  assertShares(expense.totalCents, splits, label);
  return {
    payerId: expense.payerId,
    amountCents: expense.totalCents,
    splits,
    deletedAt: expense.deletedAt,
  };
}

function postItemized(expense: ItemizedExpenseCase, label: string): PostedExpense {
  const originalSubtotal = expense.items.reduce(
    (total, item) => total + lineTotalCents(item.amountCents, item.quantity),
    0,
  );
  const expanded = expandItemPortions(expense.items);
  const expandedSubtotal = expanded.reduce(
    (total, item) => total + lineTotalCents(item.amountCents, item.quantity),
    0,
  );
  if (expandedSubtotal !== originalSubtotal) {
    fail(
      `${label}: portion lines add up to ${expandedSubtotal} cents, but the items add up to ${originalSubtotal} cents.`,
    );
  }

  const calculation = calculateItemizedExpense({
    items: expanded,
    taxCents: expense.taxCents,
    tipCents: expense.tipCents,
  });
  if (calculation.itemSubtotalCents !== expandedSubtotal) {
    fail(
      `${label}: item subtotal is ${calculation.itemSubtotalCents} cents, expected ${expandedSubtotal}.`,
    );
  }
  const memberItems = calculation.memberItemSubtotals.reduce(
    (total, row) => total + row.amountCents,
    0,
  );
  if (memberItems !== calculation.itemSubtotalCents) {
    fail(
      `${label}: per-person item shares add up to ${memberItems} cents, item subtotal is ${calculation.itemSubtotalCents}.`,
    );
  }
  expanded.forEach((item, index) => {
    const line = lineTotalCents(item.amountCents, item.quantity);
    assertShares(
      line,
      calculation.itemSplits[index] ?? [],
      `${label} item ${index} (${item.description})`,
    );
  });
  const expectedTotal = originalSubtotal + expense.taxCents + expense.tipCents;
  if (calculation.calculatedTotalCents !== expectedTotal) {
    fail(
      `${label}: calculated total is ${calculation.calculatedTotalCents} cents, items + tax + tip is ${expectedTotal}.`,
    );
  }
  assertShares(calculation.calculatedTotalCents, calculation.splits, label);
  return {
    payerId: expense.payerId,
    amountCents: calculation.calculatedTotalCents,
    splits: calculation.splits,
    deletedAt: expense.deletedAt,
  };
}

function postLedger(ledger: Ledger): {
  expenses: PostedExpense[];
  settlements: PostedSettlement[];
} {
  const expenses = ledger.expenses.map((expense, index) => {
    const label = `expense ${index}`;
    assertGroupMembers(ledger, expense.payerId, label);
    if (expense.kind === "simple") {
      if (expense.totalCents > MAX_TOTAL_CENTS) {
        fail(`${label}: total ${expense.totalCents} is above the draft cap.`);
      }
      for (const input of expense.inputs) {
        assertGroupMembers(ledger, input.memberId, label);
      }
      return postSimple(expense, `${label} ${expense.mode} ${expense.totalCents} cents`);
    }
    for (const item of expense.items) {
      for (const memberId of item.memberIds) assertGroupMembers(ledger, memberId, label);
      for (const portion of item.portions ?? []) {
        for (const memberId of portion) assertGroupMembers(ledger, memberId, label);
      }
    }
    return postItemized(expense, label);
  });

  for (const settlement of ledger.settlements) {
    assertGroupMembers(ledger, settlement.fromMemberId, "settlement");
    assertGroupMembers(ledger, settlement.toMemberId, "settlement");
    if (settlement.fromMemberId === settlement.toMemberId) {
      fail("settlement: payer and recipient are the same person.");
    }
    if (!Number.isInteger(settlement.amountCents) || settlement.amountCents <= 0) {
      fail(`settlement: amount ${settlement.amountCents} is not a positive number of cents.`);
    }
  }

  return { expenses, settlements: ledger.settlements };
}

function assertLedgerConserved(ledger: Ledger) {
  const posted = postLedger(ledger);
  const nets = memberNets(posted.expenses, posted.settlements);
  const liveOnly = memberNets(
    posted.expenses.filter((expense) => !expense.deletedAt),
    posted.settlements,
  );
  if (!netsEqual(nets, liveOnly)) {
    fail(
      "A soft-deleted expense still changes someone's net. Deleted expenses stay in the table and must be left out of balances, the way activeExpense() leaves out deleted_at.",
    );
  }
  assertClears(nets, "group");
}

function members(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `m${index}`);
}

function equalInputs(count: number): SplitInput[] {
  return members(count).map((memberId) => ({ memberId, weight: 1 }));
}

describe("balance conservation", () => {
  it("drops a deleted dinner and still clears the live snack", () => {
    const ledger: Ledger = {
      memberIds: ["ada", "bea"],
      expenses: [
        {
          kind: "simple",
          payerId: "ada",
          totalCents: 1000,
          mode: "equal",
          inputs: [
            { memberId: "ada", weight: 1 },
            { memberId: "bea", weight: 1 },
          ],
          deletedAt: true,
        },
        {
          kind: "simple",
          payerId: "ada",
          totalCents: 400,
          mode: "equal",
          inputs: [
            { memberId: "ada", weight: 1 },
            { memberId: "bea", weight: 1 },
          ],
          deletedAt: false,
        },
      ],
      settlements: [
        { fromMemberId: "bea", toMemberId: "ada", amountCents: 50 },
      ],
    };
    assertLedgerConserved(ledger);
    const posted = postLedger(ledger);
    expect(Object.fromEntries(memberNets(posted.expenses, posted.settlements))).toEqual({
      ada: 150,
      bea: -150,
    });
  });

  it("conserves a $1.00 equal split among three people", () => {
    assertLedgerConserved({
      memberIds: ["m0", "m1", "m2"],
      expenses: [
        {
          kind: "simple",
          payerId: "m0",
          totalCents: 100,
          mode: "equal",
          inputs: equalInputs(3),
          deletedAt: false,
        },
      ],
      settlements: [],
    });
  });

  it("conserves an itemized check at the draft cap, including a 1-cent tax", () => {
    const memberIds = members(7);
    assertLedgerConserved({
      memberIds,
      expenses: [
        {
          kind: "itemized",
          payerId: "m0",
          taxCents: 1,
          tipCents: 0,
          deletedAt: false,
          items: [
            {
              description: "Rent",
              amountCents: MAX_TOTAL_CENTS - 1,
              quantity: 1,
              memberIds,
            },
          ],
        },
      ],
      settlements: [],
    });
  });

  it("conserves quantity, portions, and a leftover cent of tax and tip", () => {
    assertLedgerConserved({
      memberIds: ["m0", "m1", "m2"],
      expenses: [
        {
          kind: "itemized",
          payerId: "m1",
          taxCents: 1,
          tipCents: 1,
          deletedAt: false,
          items: [
            {
              description: "Gum",
              amountCents: 1,
              quantity: 100,
              memberIds: ["m0", "m1", "m2"],
            },
            {
              description: "Candy",
              amountCents: 50,
              quantity: 3,
              memberIds: ["m0"],
              portions: [["m0"], ["m1", "m2"], ["m2"]],
            },
          ],
        },
      ],
      settlements: [],
    });
  });

  it("splits every equal total from 0 through 1000 cents among 1 to 12 people, and clears the nets", () => {
    let cases = 0;
    for (let count = 1; count <= 12; count += 1) {
      const inputs = equalInputs(count);
      for (let totalCents = 0; totalCents <= 1000; totalCents += 1) {
        const splits = allocateSplits(totalCents, "equal", inputs);
        assertShares(totalCents, splits, `equal ${count} people, ${totalCents} cents`);
        const nets = memberNets(
          [
            {
              payerId: inputs[0].memberId,
              amountCents: totalCents,
              splits,
              deletedAt: false,
            },
          ],
          [],
        );
        assertClears(nets, `equal ${count} people, ${totalCents} cents`);
        cases += 1;
      }
    }
    expect(cases).toBe(12 * 1001);
  });

  it("splits awkward equal totals through the participant cap and the draft cap", () => {
    const totals = [0, 1, 2, 3, 99, 100, 101, 10_000, MAX_TOTAL_CENTS];
    for (let count = 1; count <= MAX_PARTICIPANTS; count += 1) {
      const inputs = equalInputs(count);
      for (const totalCents of totals) {
        const splits = allocateSplits(totalCents, "equal", inputs);
        assertShares(
          totalCents,
          splits,
          `equal ${count} people, ${totalCents} cents`,
        );
      }
    }
  });

  it("splits every whole-percent pair and triple for small totals", () => {
    const totals = [0, 1, 2, 3, 50, 99, 100, 101];
    const check = (weights: number[], totalCents: number) => {
      if (weights.every((weight) => weight === 0)) return;
      const inputs = weights.map((weight, index) => ({
        memberId: `m${index}`,
        weight,
      }));
      const splits = allocateSplits(totalCents, "percent", inputs);
      assertShares(
        totalCents,
        splits,
        `percent ${weights.join("/")} of ${totalCents} cents`,
      );
    };

    for (let first = 0; first <= 100; first += 1) {
      for (const totalCents of totals) check([first, 100 - first], totalCents);
    }
    eachComposition(100, 3, (weights) => {
      for (const totalCents of totals) check(weights, totalCents);
    });
  });

  it("splits every small integer share assignment", () => {
    const check = (weights: number[], totalCents: number) => {
      if (weights.every((weight) => weight === 0)) return;
      const inputs = weights.map((weight, index) => ({
        memberId: `m${index}`,
        weight,
      }));
      const splits = allocateSplits(totalCents, "shares", inputs);
      assertShares(
        totalCents,
        splits,
        `shares ${weights.join(":")} of ${totalCents} cents`,
      );
    };

    for (let left = 0; left <= 10; left += 1) {
      for (let right = 0; right <= 10; right += 1) {
        if (left === 0 && right === 0) continue;
        for (let totalCents = 0; totalCents <= 100; totalCents += 1) {
          check([left, right], totalCents);
        }
      }
    }
    for (let first = 0; first <= 4; first += 1) {
      for (let second = 0; second <= 4; second += 1) {
        for (let third = 0; third <= 4; third += 1) {
          if (first === 0 && second === 0 && third === 0) continue;
          for (let totalCents = 0; totalCents <= 50; totalCents += 1) {
            check([first, second, third], totalCents);
          }
        }
      }
    }
  });

  it("clears every zero-sum balance in the small box", () => {
    for (let net = -5000; net <= 5000; net += 1) {
      assertClears(
        new Map([
          ["m0", net],
          ["m1", -net],
        ]),
        `two people, ${net} cents`,
      );
    }
    for (let net = -MAX_TOTAL_CENTS; net <= MAX_TOTAL_CENTS; net += 1000) {
      assertClears(
        new Map([
          ["m0", net],
          ["m1", -net],
        ]),
        `two people, ${net} cents`,
      );
    }
    assertClears(
      new Map([
        ["m0", MAX_TOTAL_CENTS],
        ["m1", -MAX_TOTAL_CENTS],
      ]),
      "two people at the draft cap",
    );
    for (let first = -20; first <= 20; first += 1) {
      for (let second = -20; second <= 20; second += 1) {
        assertClears(
          new Map([
            ["m0", first],
            ["m1", second],
            ["m2", -(first + second)],
          ]),
          `three people, ${first}, ${second}`,
        );
      }
    }
    for (let first = -8; first <= 8; first += 1) {
      for (let second = -8; second <= 8; second += 1) {
        for (let third = -8; third <= 8; third += 1) {
          assertClears(
            new Map([
              ["m0", first],
              ["m1", second],
              ["m2", third],
              ["m3", -(first + second + third)],
            ]),
            `four people, ${first}, ${second}, ${third}`,
          );
        }
      }
    }
  });

  it(
    "conserves random simple and itemized ledgers, then clears them",
    () => {
      fc.assert(
        fc.property(ledgerArb, (ledger) => {
          try {
            assertLedgerConserved(ledger);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${message}\nLedger: ${JSON.stringify(ledger)}`);
          }
        }),
        {
          numRuns: PROPERTY_RUNS,
          seed: PROPERTY_SEED,
          endOnFailure: true,
        },
      );
    },
    30_000,
  );
});

function eachComposition(
  total: number,
  parts: number,
  visit: (weights: number[]) => void,
) {
  const weights = Array<number>(parts).fill(0);
  const walk = (index: number, remaining: number) => {
    if (index === parts - 1) {
      weights[index] = remaining;
      visit(weights);
      return;
    }
    for (let value = 0; value <= remaining; value += 1) {
      weights[index] = value;
      walk(index + 1, remaining - value);
    }
  };
  walk(0, total);
}

function composition(total: number, parts: number): fc.Arbitrary<number[]> {
  if (parts <= 1) return fc.constant([total]);
  return fc
    .array(fc.integer({ min: 0, max: total }), {
      minLength: parts - 1,
      maxLength: parts - 1,
    })
    .map((cuts) => {
      const points = [0, ...cuts, total].sort((left, right) => left - right);
      const weights: number[] = [];
      for (let index = 1; index < points.length; index += 1) {
        weights.push(points[index] - points[index - 1]);
      }
      return weights;
    });
}

function percentWeights(parts: number): fc.Arbitrary<number[]> {
  return composition(1_000_000, parts)
    .map((basis) => {
      const weights = basis.map((part) => part / 10_000);
      const head = weights.slice(0, -1);
      const tail = 100 - head.reduce((sum, weight) => sum + weight, 0);
      return [...head, tail];
    })
    .filter(
      (weights) =>
        weights.length === parts &&
        weights.every((weight) => weight >= 0 && Number.isFinite(weight)) &&
        Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) <=
          0.0001,
    );
}

function shareWeights(parts: number): fc.Arbitrary<number[]> {
  return fc
    .array(fc.integer({ min: 0, max: 200 }), {
      minLength: parts,
      maxLength: parts,
    })
    .map((tenths) => tenths.map((tenth) => tenth / 10))
    .filter((weights) => weights.some((weight) => weight > 0));
}

function simpleExpenseArb(memberIds: string[]): fc.Arbitrary<SimpleExpenseInput> {
  return fc
    .record({
      payerId: fc.constantFrom(...memberIds),
      totalCents: fc.oneof(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: MAX_TOTAL_CENTS }),
      ),
      mode: fc.constantFrom(
        "equal" as const,
        "exact" as const,
        "percent" as const,
        "shares" as const,
      ),
      participantIds: fc.subarray(memberIds, { minLength: 1 }),
      deletedAt: fc.boolean(),
    })
    .chain((expense) => {
      const count = expense.participantIds.length;
      const weights: fc.Arbitrary<number[]> =
        expense.mode === "equal"
          ? fc.constant(Array<number>(count).fill(1))
          : expense.mode === "exact"
            ? composition(expense.totalCents, count)
            : expense.mode === "percent"
              ? percentWeights(count)
              : shareWeights(count);
      return weights.map((chosen) => ({
        kind: "simple" as const,
        payerId: expense.payerId,
        totalCents: expense.totalCents,
        mode: expense.mode,
        deletedAt: expense.deletedAt,
        inputs: expense.participantIds.map((memberId, index) => ({
          memberId,
          weight: chosen[index] ?? 0,
        })),
      }));
    });
}

function itemArb(memberIds: string[]): fc.Arbitrary<PortionedItemInput> {
  return fc
    .record({
      amountCents: fc.integer({ min: 1, max: 200_000 }),
      quantity: fc.integer({ min: 1, max: 8 }),
      memberIds: fc.subarray(memberIds, { minLength: 1 }),
      splitMode: fc.constantFrom(
        "equal" as const,
        "exact" as const,
        "percent" as const,
        "shares" as const,
      ),
      portioned: fc.boolean(),
    })
    .chain((item): fc.Arbitrary<PortionedItemInput> => {
      const line = lineTotalCents(item.amountCents, item.quantity);
      if (item.portioned && item.quantity > 1) {
        return fc
          .array(fc.subarray(memberIds, { minLength: 1 }), {
            minLength: item.quantity,
            maxLength: item.quantity,
          })
          .map((portions) => ({
            description: "Item",
            amountCents: item.amountCents,
            quantity: item.quantity,
            memberIds: item.memberIds,
            portions,
          }));
      }
      if (item.splitMode === "equal") {
        return fc.constant({
          description: "Item",
          amountCents: item.amountCents,
          quantity: item.quantity,
          memberIds: item.memberIds,
          splitMode: "equal" as const,
        });
      }
      const count = item.memberIds.length;
      const weights: fc.Arbitrary<number[]> =
        item.splitMode === "exact"
          ? composition(line, count)
          : item.splitMode === "percent"
            ? percentWeights(count)
            : shareWeights(count);
      return weights.map((chosen) => ({
        description: "Item",
        amountCents: item.amountCents,
        quantity: item.quantity,
        memberIds: item.memberIds,
        splitMode: item.splitMode,
        weights: Object.fromEntries(
          item.memberIds.map((memberId, index) => [memberId, chosen[index] ?? 0]),
        ),
      }));
    });
}

function itemizedExpenseArb(memberIds: string[]): fc.Arbitrary<ItemizedExpenseCase> {
  return fc.record({
    kind: fc.constant("itemized" as const),
    payerId: fc.constantFrom(...memberIds),
    taxCents: fc.integer({ min: 0, max: 50_000 }),
    tipCents: fc.integer({ min: 0, max: 50_000 }),
    deletedAt: fc.boolean(),
    items: fc.array(itemArb(memberIds), { minLength: 1, maxLength: 4 }),
  });
}

function settlementArb(memberIds: string[]): fc.Arbitrary<SettlementInput> {
  return fc
    .tuple(
      fc.constantFrom(...memberIds),
      fc.constantFrom(...memberIds),
      fc.integer({ min: 1, max: 10_000_000 }),
    )
    .filter(([fromMemberId, toMemberId]) => fromMemberId !== toMemberId)
    .map(([fromMemberId, toMemberId, amountCents]) => ({
      fromMemberId,
      toMemberId,
      amountCents,
    }));
}

const ledgerArb: fc.Arbitrary<Ledger> = fc
  .integer({ min: 1, max: 8 })
  .chain((count) => {
    const memberIds = members(count);
    return fc.record({
      memberIds: fc.constant(memberIds),
      expenses: fc.array(
        fc.boolean().chain((itemized): fc.Arbitrary<ExpenseInput> =>
          itemized ? itemizedExpenseArb(memberIds) : simpleExpenseArb(memberIds),
        ),
        { minLength: 0, maxLength: 4 },
      ),
      settlements:
        count < 2
          ? fc.constant<SettlementInput[]>([])
          : fc.array(settlementArb(memberIds), { minLength: 0, maxLength: 3 }),
    });
  });
