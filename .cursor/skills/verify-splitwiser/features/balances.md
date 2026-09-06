# Balances

Balances lets a member see who owes whom after expenses, record a payment that already happened, and reach a settled group.

## Sub-features

- `balances-open` opens Balances from group home and from the Balances tab.
- `balances-owe` shows Alice owed and Sam owing after the Groceries expense in add-expense.
- `balances-record` records a payment from Sam to Alice.
- `balances-settled` shows everyone settled and a recent payment row.

## How to get to it (user POV)

- On group home, when the balance is non-zero, choose `Settle up`.
- In the group tab bar, choose `Balances`.
- On Balances, choose `Record` on a suggestion, `Settle group`, or `Record a payment` / `Record a different payment`.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice.
- Group `<GROUP_NAME_PREFIX> Cabin` has members `Alice Verify` and `Sam`.
- Expense `Groceries` for `$12.34` paid by Alice, equal split, already exists (add-expense recipe). Alice should be owed `$6.17`.

- **Home entry.** On group home, `Your balance` reads `You're owed $6.17`. Choose `Settle up`. Heading is `Balances`.
- **Tab entry.** From any group tab, choose `Balances`. Same heading.
- **Owe state.** Alice's row includes `you` and `owed $6.17`. Sam's row includes `owes $6.17`. A `Record` button is visible on the suggestion. Screenshot `balances-owe.png`.
- **Record suggested payment.** Choose `Record`. Dialog title `Record this payment?`. Choose `Record` in the dialog. Toast `Payment recorded` (or equivalent success). Alice's row becomes `settled`. Sam's row becomes `settled`. `Your balance` path back on Home reads `All settled up`.
- **Recent payment.** Still on Balances, a recent payment lists Sam paying Alice `$6.17`. Screenshot `balances-settled.png`.
- **Home confirm.** Choose tab `Home`. `All settled up`. Groceries remains under `Recent expenses`.
- **Proof.** Capture the owed list, the confirm dialog, the settled list with the payment row, and home `All settled up`. If you use `Settle group` instead of `Record`, say so — that path records all suggestions at once and is a different sub-feature (`Settle the group?` dialog, confirm `Settle group`).

## Gotchas

- `Settle group` zeros everyone by recording every suggestion. Use it only when proving that control. The default proof is the single `Record` suggestion.
- `Record a payment` opens a sheet titled `Record a payment` with fields `From`, `To`, `Amount (USD)`. Manual amounts must match cents the UI would display (`6.17`, not `6.170`).
- Recording Alice → Alice or the reverse of the suggestion will not produce the settled state this recipe asserts.
- After settlement, group home hides `Settle up` because net is 0. Use tab `Balances` to see payment history.
- Placeholder `Sam` cannot sign in. Only Alice can record the payment in this recipe.
