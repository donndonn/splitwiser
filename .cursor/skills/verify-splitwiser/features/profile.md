# Profile

Profile lets a signed-in user save a Venmo username. When that person is owed in a USD group, Balances shows a pay link with the amount and a Splitwiser note. Do not complete Venmo.

## Sub-features

- `profile-open` opens Profile from app navigation.
- `profile-venmo-save` stores a Venmo username and shows it back on Profile.
- `venmo-pay-link` shows `Pay {name} {amount}` with a `Venmo` label. The link target includes the amount and note. Do not finish payment.

## How to get to it (user POV)

- In navigation `App navigation`, choose `Profile`.
- Open `http://127.0.0.1:3017/profile`.
- On a group’s Balances tab, when you owe a member who saved Venmo, the pay link sits above `Settle group`.

## Driving it with Cursor browser

Preconditions:

- Signed in flow can switch Alice and Bob (`VERIFY_ALICE_EMAIL`, `VERIFY_BOB_EMAIL`, `SPLITWISER_VERIFY_SECRET`).
- Alice and Bob are friends, and both are members of `<GROUP_NAME_PREFIX> Cabin` (members recipe). `Sam` may also be a member.
- Do not change `Username` or `Display name`. Friend search uses the seeded username.

- **Bob’s Venmo.** Sign in as Bob. Choose `Profile`. Heading is `Profile`. `Venmo` reads `Not set`. Choose `Edit profile`. Fill textbox `Venmo` with `swvbobpay` (no `@`). Choose `Save`. The field shows `@swvbobpay`. Screenshot `profile-venmo.png`.
- **Alice owes Bob.** Sign out and verify-sign-in as Alice. Open `<GROUP_NAME_PREFIX> Cabin`. Add a manual expense `Taxi` for `10.00`. On the money form, next to `Paid by`, choose the button whose name includes `Alice Verify`. Sheet title `Choose payer`. Choose the button whose name includes `Bob Verify` (the initial is part of the accessible name, for example `B Bob Verify`). Leave the split on `equally`. Choose `Add expense`. Home is not `All settled up`.
- **Pay link.** Choose tab `Balances`. A link whose name includes `Pay Bob Verify` and `Venmo` is visible. Its URL contains `venmo.com`, `txn=pay`, `amount=`, and `note=` (the note decodes to a string that starts with `Splitwiser` and includes the group name). Screenshot `profile-venmo-pay.png`. Do not complete Venmo’s site or app.
- **Second view.** Choose `Profile` as Alice. This does not need Alice’s own Venmo. Go back to Balances and confirm the same `Pay Bob Verify` link is still there. Bob’s Profile still shows `@swvbobpay` if you sign in as Bob again.
- **Proof.** Save Bob’s saved `@swvbobpay`, the pay link on Balances, and the link URL (address or element href). Record that Venmo checkout was not completed.

## Gotchas

- The pay link is only for a suggestion you owe, only in USD, and only when the person you pay has a Venmo username. Sam never gets one. Alice paying her own expense does not show a link to herself.
- Other open debts are netted into that suggestion. If Snacks is still unpaid, the link amount can be a few cents (this run: `Pay Bob Verify $0.34`) rather than half of Taxi. Proof is the link name, `txn=pay`, `amount`, and a note starting with `Splitwiser`, not a specific half.
- The visible name is `Pay {display name} {amount}` plus the word `Venmo`. It is not the phrase `Pay on Venmo`.
- Opening the link leaves Splitwiser for Venmo. Abort that page; do not log into Venmo. Reading `href` is enough.
- Clearing Venmo back to empty shows `Not set`. This recipe leaves `swvbobpay` in place. Cleanup deletes the verify user.
- `Sign out` on this screen is the sign-in feature. Do not treat theme changes as part of this proof.
