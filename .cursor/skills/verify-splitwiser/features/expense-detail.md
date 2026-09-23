# Expense detail

Expense detail lets a member open a saved expense and expand the split math without editing it.

## Sub-features

- `expense-open-detail` opens the expense from Recent on group home.
- `expense-payer-line` shows who paid, using the member’s display name.
- `expense-show-details` expands equal-split math, then collapses it.

## How to get to it (user POV)

- On group home, under `Recent expenses`, choose the expense row (for this recipe, `Groceries`).
- The page heading is `Expense`.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice.
- Group `<GROUP_NAME_PREFIX> Cabin` has members `Alice Verify` and `Sam`.
- Expense `Groceries` for `$12.34`, paid by Alice, equal split, is on Recent (add-expense recipe). Do this before mark-as-settled archives it.

- **Open.** On group home, choose the `Groceries` row. Heading is `Expense`. The amount is `$12.34`. The payer line reads `Alice Verify paid $12.34` (display name here; the home list said `You paid`). Screenshot `expense-detail.png`.
- **Shares.** The list includes `Sam owes $6.17` and `Alice Verify owes $6.17`.
- **Expand math.** Choose the control whose name includes `Split equally` and `Show details`. The expanded text includes `$12.34 ÷ 2 people` and `$6.17 each`. The control name now includes `Hide details`. Screenshot `expense-detail-math.png`.
- **Collapse.** Choose `Hide details`. The division sentence is gone. The control name includes `Show details` again.
- **Second view.** Choose link `Back`. Group home `Recent expenses` still lists `Groceries`.
- **Proof.** Save the detail screen, the expanded math, and the home row after going back.

## Gotchas

- Do not choose `Edit` or delete. This recipe is read-only.
- Home-list copy `You paid` / `Owes you` is the add-expense assertion. Detail uses `Alice Verify paid`.
- `Show details` is the split-math disclosure. A manual expense has no receipt photo; do not wait for one.
- `Scan receipt` / `Upload receipt` stays skipped unless `GOOGLE_API_KEY` is set. Itemized receipt lines are out of this recipe.
- After mark-as-settled, `Groceries` leaves the main Recent list. Open it from `Earlier expenses settled` or run this recipe first.
