# Add an expense

Add an expense lets a group member describe a cost, assign who paid, split it, and see it on the group home and activity feed.

## Sub-features

- `expense-open` opens the add-expense flow from group home and from the Add tab.
- `expense-manual` skips Gemini prefill and fills the form by hand.
- `expense-save-equal` saves a simple equal-split expense.
- `expense-home-row` shows the saved expense on group home.
- `expense-activity` shows a created-expense row on Activity.

## How to get to it (user POV)

- On group home, choose `Add expense`.
- In the group tab bar, choose `Add`.
- After opening the describe step, choose `Enter manually` (default proof path).
- `Fill form` (Gemini) and `Scan receipt` are optional production-boundary paths.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice.
- A group named `<GROUP_NAME_PREFIX> Cabin` exists and Alice is a member. Create it with the create-group recipe if needed.
- Prefer two participants: on tab `Members`, in `Add people by name`, fill placeholder `Name` with `Sam` and choose `Add`. The members list then includes `Alice Verify` and `Sam`.
- Do not use `Fill form` or `Scan receipt` unless proving those sub-features and `GOOGLE_API_KEY` is configured.

- **Home entry.** On group home `<GROUP_NAME_PREFIX> Cabin`, choose link `Add expense`. Heading is `Add expense`. Textbox `Describe the expense` is visible with buttons `Fill form`, `Enter manually`, and `Scan receipt`.
- **Tab entry.** From group home, choose tab `Add`. The same describe step appears.
- **Manual form.** Choose `Enter manually`. Heading stays `Add expense`. Textbox `What was it for?` and an amount field whose name starts with `Amount` are visible. Default split copy includes `split` `equally`. Default payer is Alice's display name.
- **Fill.** Fill `What was it for?` with `Groceries`. Fill the amount textbox with `12.34`. Leave date as today.
- **Save.** Choose button `Add expense`. The app returns to group home. `Recent expenses` includes `Groceries`. Amount displays as `$12.34`. Paid-by text includes `Alice Verify`. Screenshot `add-expense-home.png`.
- **Activity.** Choose tab `Activity`. A row describes Alice adding Groceries (wording includes `Groceries` and `$12.34`). Screenshot `add-expense-activity.png`.
- **Proof.** Save the describe step, the filled manual form, group home with the new row, and activity. If `Fill form` / `Scan receipt` were skipped, record that skip — do not mark them verified.

## Gotchas

- The first Add expense screen is a describe step, not the money form. `Add expense` on that step does not exist until after `Enter manually`.
- `Fill form` needs `GOOGLE_API_KEY` and hits Gemini rate limits. A toast error is not a product-regression by itself if the key is missing.
- Equal split among Alice and Sam makes Alice owed and Sam owe. `All settled up` is wrong after this expense; expect a non-zero `Your balance` on home (`You're owed $6.17` with two members).
- Equal split with only Alice (no Sam) stays settled because she paid her own share. If you skipped the Sam placeholder, assert `All settled up` and still assert the Groceries row exists.
- Reopen the expense from the recent list (row `Groceries`) if you need a third view; heading is `Expense`.
