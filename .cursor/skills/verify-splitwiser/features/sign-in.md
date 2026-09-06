# Sign in

Sign in lets a visitor open Splitwiser, reach the Google or verification credentials form, start a session as a seeded verify user, and sign out back to the marketing landing.

## Sub-features

- `signin-landing` shows the signed-out home with product name and a path to sign-in.
- `signin-google-cta` offers Continue with Google and must not be completed by this harness.
- `signin-verify` creates a session for a seeded `@splitwiser.invalid` user.
- `signin-session-home` shows Your groups after a successful verify sign-in.
- `signin-signout` returns to the signed-out landing.

## How to get to it (user POV)

- Open `http://127.0.0.1:3017/` while signed out and choose `Sign in with Google`.
- Open `http://127.0.0.1:3017/signin` directly.
- Open a protected URL such as `/new` or `/friends` and follow the redirect to `/signin`.
- From Profile, choose `Sign out`.

## Driving it with Cursor browser

Preconditions:

- Splitwiser is healthy at `http://127.0.0.1:3017`.
- `verify-splitwiser doctor` reports `ok` and `/signin` includes `Verify sign-in`.
- `verify-splitwiser show` provides `VERIFY_ALICE_EMAIL` and `SPLITWISER_VERIFY_SECRET`.
- The browser has no Splitwiser session cookie (or you already signed out).

- **Open landing.** Go to `http://127.0.0.1:3017/`. The heading is `Splitwiser` and a link named `Sign in with Google` is visible. Screenshot `sign-in-landing.png`.
- **Sign-in page.** Choose `Sign in with Google`. The heading is `Sign in` / `Welcome back`. Buttons named `Continue with Google` and `Verify sign-in` are both visible. Do not choose `Continue with Google`.
- **Protected redirect.** In a signed-out session, go to `http://127.0.0.1:3017/new`. The app redirects to `/signin` with a callback. The same `Welcome back` heading appears.
- **Verify credentials.** Fill textbox `Verify email` with `VERIFY_ALICE_EMAIL` and textbox `Verify secret` with `SPLITWISER_VERIFY_SECRET`. Choose `Verify sign-in`. The heading becomes `Your groups`. Empty state copy is `No groups yet` unless this run already created groups.
- **Sign out.** In navigation `App navigation`, choose `Profile`. Choose `Sign out`. The heading is `Splitwiser` again and `Sign in with Google` is visible.
- **Proof.** Save snapshots of signed-out landing, the sign-in form showing `Verification sign-in`, the post-login `Your groups` heading, and the post-logout landing. Record entry points used in `notes.md`.

## Gotchas

- `Continue with Google` leaves the app. Abort the run if that navigation happens; do not complete Google's account picker.
- Typing the secret into `Verify email` fails silently into `CredentialsSignin`. Use `show` values, not guessed passwords.
- Verify accounts must already exist (seed). A well-formed secret with an unknown email does not create a user.
- Production and `next start` hide the verify form. This skill launches `npm run dev` only.
- After sign-out, a later recipe must sign in again. Do not assume the session survived cleanup or a browser profile reset.
