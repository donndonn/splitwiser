---
name: verify-formal-balances
description: Use when a change touches expense splits, itemized tax or tip, portion splits, group net balances, soft-deleted expenses, or settle-up suggestions. Runs the check that shares add up to the expense and suggested payments clear the group.
---

# Verify formal balances

Use this when a diff touches any file in the coverage record. Skip it when the diff does not. Read this skill cold: the check is `npm run verify:balances`.

## Property

Shares of an expense are whole cents, none negative, and they add up to the expense, including each item line and the tax and tip on an itemized check. After those expenses (leaving out any with `deleted_at` set) and any pairwise payments, the members' nets add up to zero, and the settle-up suggestions bring every net to exactly zero.

## Harm

A dropped or invented cent means the group cannot settle. Someone is still owed money nobody owes, or a suggestion asks the wrong person for the wrong amount.

## Command

From the repo root:

```bash
npm run verify:balances
```

That runs `vitest run src/lib/balance-conservation.verify.test.ts`. It also runs as part of `npm test`. A pass is exit 0 and `10 passed`. A fail prints the members, the cents, and which total they missed. The run is under a second.

Tool: fast-check 3.23.2 (lockfile, `pure-rand` 6.1.0) inside Vitest 4.1.12. There is no SMT or proof assistant in this repo, and nothing here checks the SQL by running Postgres. fast-check runs the real TypeScript functions on generated inputs. The boxes below are every input, not a sample.

## Coverage

| File | Functions | How |
| --- | --- | --- |
| `src/lib/money.ts` | `allocateSplits`, `allocateByWeights` (private, called by `allocateSplits`), `suggestSettlements` | Called |
| `src/lib/itemized-expense.ts` | `calculateItemizedExpense`, `splitItemLine` (private, called by `calculateItemizedExpense`), `expandItemPortions`, `lineTotalCents` | Called |
| `src/lib/balances.ts` | `netDeltaSource`, `queryNets` | Not executed. `memberNets` in the test file copies the deltas |
| `src/lib/expenses.ts` | `activeExpense` | Not executed. The copy skips `deletedAt` |

`parseExpenseDetails` in `src/app/g/[id]/expenses/actions.ts` is what saves a split: simple expenses call `allocateSplits`, itemized expenses call `calculateItemizedExpense`, and both store `feeCents: 0` and `discountCents: 0`. The check does not call the action. If a future save path writes shares without those functions, this check stays green.

Sync commit: `38ad36d2c1fafe1eaed98f455a10dd8a843771ff`

That commit is where these functions were last confirmed to match the check. This skill file was added after it and does not change them. Trust a later pass only while this diff is empty:

```bash
git diff 38ad36d2c1fafe1eaed98f455a10dd8a843771ff -- src/lib/money.ts src/lib/itemized-expense.ts src/lib/balances.ts src/lib/expenses.ts
```

If it is not empty, re-read the functions against `memberNets` and the calls in `src/lib/balance-conservation.verify.test.ts`. Move the sync commit forward only after that read and a green `npm run verify:balances`. For later upkeep of this skill, follow `/maintain-formal-verification-skill`.

## Ledger copy

`memberNets` matches `netDeltaSource`:

- Live expense (`deleted_at` is null): the payer is credited `amountCents`, and each `expense_splits` row debits that member.
- Settlement: `fromMemberId` is credited `amountCents`, `toMemberId` is debited. Settlements have no soft-delete column. Undo removes the row.
- A member with no delta is absent, same as the `GROUP BY` in `queryNets`.

Hand check, already in the test "drops a deleted dinner and still clears the live snack": Ada paid 400 cents, split equally with Bea, and Bea has already paid Ada 50 cents. A 1000 cent dinner Ada paid is deleted. Nets are Ada +150, Bea −150. The suggestion is Bea pays Ada 150, and both end at 0. If you change those expected numbers, re-read `netDeltaSource` first. The signs are the product, not a choice the test may flip.

## Bounds

Cents stay inside JavaScript's safe integers. The top total is `100_000_000` cents ($1,000,000), which is `EXPENSE_DRAFT_LIMITS.amount` in `src/lib/ai/parse-expense-text.ts` times 100. The participant cap used for equal splits is 50, `EXPENSE_DRAFT_LIMITS.participants`.

Every input in these boxes:

- Equal split, 1 to 12 people, every total from 0 through 1000 cents, then settle-up clears the nets.
- Equal split, 1 to 50 people, at totals 0, 1, 2, 3, 99, 100, 101, 10000, and 100000000 cents (the shares add up; settle-up is not re-run on each of these).
- Whole percents: every pair that sums to 100, and every triple that sums to 100, at totals 0, 1, 2, 3, 50, 99, 100, and 101 cents.
- Shares: two people, each weight 0 through 10, not both 0, every total 0 through 100. Three people, each weight 0 through 4, not all 0, every total 0 through 50.
- Settle-up on a zero-sum list: two people, every net from −5000 to 5000 cents, and every multiple of 1000 cents from −100000000 to 100000000 including the cap. Three people, every net from −20 to 20. Four people, every net from −8 to 8.

Sampled, not every input: fast-check draws **300** ledgers with seed **20261103** (same ledgers every run). Each ledger has 1 to 8 members, 0 to 4 expenses, and 0 to 3 payments.

- A simple total is either 0..10000 cents or 0..100000000 cents.
- Modes are equal, exact, percent, and shares. Exact weights are integer cents that already add up to the total. Percent weights use steps of 0.0001, and the last weight is adjusted so the floating-point sum is 100 (inside the 0.0001 tolerance `allocateSplits` allows). Share weights are tenths from 0 to 20, and at least one is positive.
- An itemized expense has 1 to 4 items, each 1..200000 cents and quantity 1..8, tax and tip each 0..50000 cents. Some multi-quantity items are split by portion via `expandItemPortions`.
- Payments are 1..10000000 cents between two different members. About half the expenses are soft-deleted.

`suggestSettlements` is the same integer loop at every magnitude inside the safe-integer range. The exhaustive settle-up box is the small one above, plus the 1000-cent grid for two people out to the draft cap. Larger groups at large totals are only in the 300 ledgers.

## Real bug or modeling error

A real bug is a return value. The functions returned, and the cents are wrong. Examples from a run where `allocateByWeights` dropped leftover cents instead of giving them out:

- `$1.00` split equally among `m0`, `m1`, and `m2` came back `33`, `33`, `33`. That is 99 cents, not 100.
- An item of `99999999` cents split across people made the per-person item shares add up to `99999998`.

Other real failures:

- "after recording the suggestions, `m0` is at N cents" — `suggestSettlements` did not clear the group. The message lists the suggestions and the nets.
- "A soft-deleted expense still changes someone's net" — a deleted expense was included. The dinner story above is the concrete case.
- "nets add up to N cents, not 0" — a live expense or a payment created or destroyed cents.

A modeling error is the generator or the ledger copy, not the product:

- The run throws `Percentages must sum to 100`, `Exact amounts must sum to`, `Weights must sum to a positive number`, `Weights must be non-negative`, `Total must be a non-negative integer`, or `At least one participant is required`. Or an itemized error such as `must add up`, `percentages must add up`, `needs at least one share`, or `Check the split`. The generator built an input those functions reject. Fix the generator in `src/lib/balance-conservation.verify.test.ts`. Do not change `allocateSplits` or `calculateItemizedExpense` to accept it.
- "is not in this group", "above the draft cap", or "payer and recipient are the same person". The generator broke its own bounds.
- You changed `netDeltaSource` or `activeExpense` and the check is still green. It does not run SQL. Diff `memberNets` against `netDeltaSource` before you trust the pass. If the signs or the `deletedAt` skip differ, the copy is stale. Update the copy and re-run. A pass before that update is not evidence.
- A weight such as `1e308` makes `allocateSplits(100, "shares", [{ memberId: "a", weight: 1e308 }, { memberId: "b", weight: 1 }])` return `Infinity` for `a`. That is outside these bounds. `parseSplitPayload` rejects a non-integer share, and JSON cannot carry `Infinity`, so it is not saved as a balance. Do not widen this check to all finite weights unless you mean to track that overflow. See Findings below.

Do not loosen an assertion so a short sum passes. A real failure is a bug in the change, or a bug that was already there: report it with the counterexample. Update the check only when the new cents are the rule you meant to add.

## When the change is intended

A new split mode, a new adjustment (a fee that is not zero), or a new balance delta is a new rule. Update the generator and the bounds in this skill, re-run `npm run verify:balances`, and move the sync commit to the commit you confirmed. If the change was not supposed to move cents, the failure is a bug in the change.

## Findings

`allocateSplits` does not honor its own comment for every finite weight. `allocateByWeights` computes `(totalCents * weight) / totalWeight` in a JavaScript number. For total `100` and weights `1e308` and `1`, the product overflows and the huge share comes back as `Infinity`, so the parts do not add up to 100. This check does not include that input. A saved expense does not hit it: the share field would have to be typed in scientific notation, and `parseSplitPayload` in the expense action rejects a non-integer `amountCents`.

No failure inside the bounds above. The check is green on the sync commit.

## What this does not check

- Postgres. `getGroupBalances` and `listViewerGroupSummaries` are not executed. A change that drops `activeExpense()` from only one arm of `netDeltaSource` is invisible until you update `memberNets`.
- `feeCents` and `discountCents`. The columns exist. The save actions write 0. `netDeltaSource` credits `expenses.amountCents`, not amount plus fee minus discount. Tax and tip are checked because `calculateItemizedExpense` adds them into the total before splitting.
- Which person receives the leftover cent. Largest-remainder fairness can be wrong while the sum is still exact. This check only requires that the shares add up.
- That suggestions are the fewest possible payments. `suggestSettlements` is the greedy pass. This check only requires that recording them clears the group.
- Friend balances across groups (`aggregateFriendNets`). A cleared group can still route a debt through a third person, so a friend total is not the raw pairwise net.
- Mark as settled. `group_settle_markers` and `isExpenseInOpenPeriod` do not change nets. An expense created at the marker time is a separate question.
- Concurrent edits, undo races, and two people saving the same expense. This is not an ordering check.
- Totals above $1,000,000, more than 50 people in the exhaustive equal split, or share weights outside 0..20 in steps of 0.1, except the small exhaustive share box.
