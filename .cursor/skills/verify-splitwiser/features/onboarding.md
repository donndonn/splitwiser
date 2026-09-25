# Onboarding

Created: 2026-09-25 · Updated: 2026-09-25

New accounts are created only through a group invitation link. An account that signed up but has not joined a group yet ("unfinished signup") can reach only the invitation and onboarding pages until it joins.

## Sub-features

- `onboarding-signin-messages` shows the invitation-required and capacity messages on `/signin`.
- `onboarding-join-signed-out` shows the invitation page with Continue with Google and Continue with Apple (do not complete).
- `onboarding-pending-recovery` sends an unfinished signup to `/onboarding` and blocks app pages.
- `onboarding-pending-join` completes onboarding by joining through a live link.

## How to get to it (user POV)

- Open a group invitation link `/join/<token>` while signed out.
- Sign in as an account that has not joined a group.
- Open `/signin?error=invite_required` or `/signin?error=full` (the pages OAuth failures return to).

## Driving it with Cursor browser

Preconditions:

- Splitwiser is healthy and seeded; `show` provides `VERIFY_CAROL_EMAIL` and `SPLITWISER_VERIFY_SECRET`.
- Alice's `<GROUP_NAME_PREFIX> Cabin` has a live invite link (members recipe). Copy its `/join/…` path from Members.

- **Messages.** Signed out, open `/signin?error=invite_required`. An alert says `No Splitwiser account was found. New users need a group invitation link to sign up…`. Open `/signin?error=full`. The alert says `Splitwiser is currently full…`. Screenshot `onboarding-full.png`.
- **Invitation page signed out.** Open the `/join/…` path. Card title `Join <GROUP_NAME_PREFIX> Cabin` with `Continue with Google`, `Continue with Apple`, and `Verification sign-in`. Do not choose the provider buttons. Screenshot `onboarding-join-signed-out.png`.
- **Pending account is gated.** Choose `Verification sign-in` and sign in with `VERIFY_CAROL_EMAIL`. The app returns to the join page (`Who are you joining as?`). Open `/`, `/friends`, and `/new` directly. Each lands on `/onboarding` with heading `Finish joining` and button `Sign out` (seeded Carol has no signup link to resume). Screenshot `onboarding-recovery.png`.
- **Join.** Open the `/join/…` path again. Choose `Join as` with name `Carol`, then `Join group`. The group home opens. `/friends` now loads normally. On Alice's Members panel the count reads `1 of 15 joins used` (or one more than before).
- **Proof.** Save the two messages, the recovery page, and the group home after joining.

## Gotchas

- Google and Apple leave the app; OAuth signup is verified only in each provider's supported environment (Apple is production-only). Local verification credentials are not proof that OAuth signup works.
- Carol is onboarded after joining. Re-seeding does not reset her; use a new run to repeat the pending path.
