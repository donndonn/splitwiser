# Mark as settled

When every member’s net is $0, the group can confirm **Mark as settled**. That archives earlier expenses out of Recent and leaves a history row for them. Dismissing remembers Not now for this zero-balance streak.

## Sub-features

- `settle-prompt` shows Everyone’s settled up with Mark as settled and Not now after balances hit $0.
- `settle-confirm` saves the marker, hides earlier expenses from Recent, and shows Earlier expenses settled.
- `settle-history` expands that row to the archived expenses without deleting them.
- `settle-dismiss` hides the prompt for this $0 streak and keeps Recent unchanged.
- `settle-new-period` shows new expenses after a marker, and can prompt again the next time nets return to $0.

## How to get to it (user POV)

- Settle the group from Balances (`Record` a suggestion or `Settle group`) until every row reads `settled`.
- The prompt appears on group Home (Recent) and on Balances.
- After confirm, Recent on Home shows the history row; Balances and Activity still list full payment/expense history.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice.
- Group `<GROUP_NAME_PREFIX> Cabin` has members `Alice Verify` and `Sam`.
- Expense `Groceries` for `$12.34` paid by Alice, equal split, already exists (add-expense recipe).
- Complete the balances recipe through recording the suggested payment so both people are `settled` and Home reads `All settled up`.

- **Prompt on Balances.** After the payment that zeros the group, heading `Balances` includes card title `Everyone's settled up` and buttons `Not now` and `Mark as settled`. Screenshot `mark-as-settled-prompt.png`.
- **Prompt on Home.** Choose tab `Home`. The same card is visible above `Add expense`. Groceries is still under `Recent expenses`.
- **Dismiss.** Choose `Not now`. The card disappears. Reload Home (tab `Home` again or tab away and back). The prompt does not return. Groceries remains in Recent.
- **Re-prompt after a new streak.** Add expense `Coffee` for `$4.00` (manual, equal split). Home is no longer `All settled up`. On Balances, record the new suggested payment. The `Everyone's settled up` card returns.
- **Confirm.** Choose `Mark as settled`. Toast `Marked as settled` (or equivalent). The prompt is gone. Recent no longer lists `Groceries` or `Coffee` as open rows. A control `Earlier expenses settled` is visible (date suffix allowed). Screenshot `mark-as-settled-archived.png`.
- **History.** Choose `Earlier expenses settled`. The archived list includes `Groceries` and `Coffee`. Amounts still display. Opening a row still reaches the expense screen.
- **New open period.** Add expense `Snacks` for `$6.00`. Recent shows `Snacks`. `Groceries` and `Coffee` stay behind `Earlier expenses settled`, not in the main list. Screenshot `mark-as-settled-new-period.png`.
- **Unchanged surfaces.** Tab `Balances` still lists the recorded payments. Tab `Activity` still lists the expenses and payments. Nothing is deleted.
- **Proof.** Capture the prompt, Recent after confirm (history row, no archived titles in the main list), expanded history, and Recent after the new expense. Note if you used `Settle group` instead of per-row `Record`.

## Gotchas

- The prompt is only for a group-wide $0, not “Your balance” being zero while someone else still owes.
- `Not now` must survive refresh while still at $0. A new expense that leaves $0, then a later settle-to-zero, is a new streak and may prompt again.
- Mark as settled does not record a payment. Pairwise settlements stay on Balances.
- Do not expect a divider among visible expenses. Archived rows are hidden until the history control is opened.
- Placeholder `Sam` cannot sign in. Drive this recipe as Alice.
