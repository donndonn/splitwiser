# Install app

Signed-in home opens a bottom sheet that explains how to add Splitwiser to the home screen. Profile can open that same sheet again after it is dismissed. The signed-out landing does not show it.

## Sub-features

- `install-home-card` opens the sheet on Your groups about two seconds after sign-in.
- `install-not-now` hides the sheet. A later visit in the same browser tab stays hidden. Profile can open it again.
- `install-dont-show` hides the home sheet until the person asks again from Profile.
- `install-profile` opens the same sheet from Profile.

## How to get to it (user POV)

- Sign in, land on Your groups, and wait. A bottom sheet covers the lower part of the screen, including the tab bar.
- Choose `Close`, `Not now`, or `Don't show again` on that sheet.
- In navigation `App navigation`, choose `Profile`. Under the name, the section `Home screen` has `Add to Home Screen`.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice (`VERIFY_ALICE_EMAIL`, `SPLITWISER_VERIFY_SECRET`).
- Clear site data for `http://127.0.0.1:3017` before the first proof so an earlier dismiss does not hide the card.

- **Home sheet.** After verify sign-in, stay on Your groups. Within a few seconds a sheet titled `Install Splitwiser` opens over the list. It offers `Install`, or it lists Share, View More, and Add to Home Screen, or it tells you to use the browser menu. It also offers `Close`, `Not now`, and `Don't show again`. Screenshot `install-home.png`.
- **Not now.** Choose `Not now`. The sheet leaves. Reload Your groups. The sheet does not return. Screenshot `install-snoozed.png`.
- **Profile reopen.** Choose `Profile`. Choose `Add to Home Screen`. The same sheet is visible again. Screenshot `install-profile.png`.
- **Don't show again.** Choose `Don't show again`. Go to Your groups and reload. The sheet stays gone. Profile still has `Add to Home Screen`.

## Gotchas

- The sheet is not on the signed-out landing, Friends, or a group.
- An installed app (home screen, without the browser bar) does not show the home sheet.
- The sheet covers the tab bar. That is the intended drawer.
- Desktop Chrome may show menu instructions instead of `Install`. That is still the sheet.
- `Close` on home snoozes the same way as `Not now`. On Profile, `Close` returns to the row and leaves the saved dismiss alone.
- `Not now` lasts about seven days. Proof in one tab is the reload, not a clock change.
