# Sign in

Sign in lets a visitor open Splitwiser, continue with Google or Apple from the landing or `/signin`, start a session with verification credentials on `/signin`, and sign out back to the marketing landing.

## Sub-features

- `signin-landing` shows the signed-out home with the product name and Continue with Google and Continue with Apple. Verification sign-in stays on `/signin`.
- `signin-google-cta` offers Continue with Google and must not be completed by this harness.
- `signin-apple-cta` offers Continue with Apple and must not be completed by this harness.
- `signin-verify` creates a session for a seeded `@splitwiser.invalid` user.
- `signin-session-home` shows Your groups after a successful verify sign-in.
- `signin-signout` returns to the signed-out landing.

## How to get to it (user POV)

- Open `http://127.0.0.1:3017/` while signed out. `Continue with Google` and `Continue with Apple` are on the landing. Do not choose them; they leave the app. Open `/signin` directly for verification credentials.
- Open `http://127.0.0.1:3017/signin` directly.
- Open a protected URL such as `/new` or `/friends` and follow the redirect to `/signin`.
- From Profile, choose `Sign out`.

## Driving it with Cursor browser

Preconditions:

- Splitwiser is healthy at `http://127.0.0.1:3017`.
- `verify-splitwiser doctor` reports `ok` and `/signin` includes `Verify sign-in`.
- `verify-splitwiser show` provides `VERIFY_ALICE_EMAIL` and `SPLITWISER_VERIFY_SECRET`.
- The browser has no Splitwiser session cookie (or you already signed out).

- **Open landing.** Go to `http://127.0.0.1:3017/`. The heading is `Splitwiser`. Buttons named `Continue with Google` and `Continue with Apple` are visible, with the note `New to Splitwiser? You'll need a group invitation link to sign up.` `Verify sign-in` is not on this page. Screenshot `sign-in-landing.png`. Do not choose either provider button.
- **Sign-in page.** Open `http://127.0.0.1:3017/signin`. The heading is `Sign in` / `Welcome back`. Buttons named `Continue with Google`, `Continue with Apple`, and `Verify sign-in` are visible. Do not choose `Continue with Google` or `Continue with Apple`.
- **Protected redirect.** In a signed-out session, go to `http://127.0.0.1:3017/new`. The app redirects to `/signin?callbackUrl=%2Fnew`. The same `Welcome back` heading appears. Do not submit credentials on that URL yet: the callback sends a successful verify to `/new` (heading `New group`), not `Your groups`.
- **Verify credentials.** Open `http://127.0.0.1:3017/signin` with no callback. Fill textbox `Verify email` with `VERIFY_ALICE_EMAIL` and textbox `Verify secret` with `SPLITWISER_VERIFY_SECRET`. Choose `Verify sign-in`. The heading becomes `Your groups`. Empty state copy is `No groups yet` unless this run already created groups.
- **Sign out.** In navigation `App navigation`, choose `Profile`. Choose `Sign out`. The heading is `Splitwiser` again and buttons `Continue with Google` and `Continue with Apple` are visible.
- **Proof.** Save snapshots of signed-out landing, the sign-in form showing `Verification sign-in`, the post-login `Your groups` heading, and the post-logout landing. Record entry points used in `notes.md`.

## Gotchas

- `Continue with Google` leaves the app. Abort the run if that navigation happens; do not complete Google's account picker.
- `Continue with Apple` leaves the app (or fails locally without Apple env). Do not complete Apple's account picker.
- Verify on `/signin?callbackUrl=…` follows that callback. A check that the home heading is `Your groups` must submit from `/signin` with no callback.
- Typing the secret into `Verify email` fails silently into `CredentialsSignin`. Use `show` values, not guessed passwords.
- Verify accounts must already exist (seed). A well-formed secret with an unknown email does not create a user.
- Carol is seeded as an unfinished signup. Signing in as Carol lands on `/onboarding`, not `Your groups`; see [Onboarding](./onboarding.md).
- Production and `next start` hide the verify form. This skill launches `npm run dev` only.
- After sign-out, a later recipe must sign in again. Do not assume the session survived cleanup or a browser profile reset.
