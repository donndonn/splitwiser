# Install app

Signed-in home offers a card that explains how to add Splitwiser to the home screen. Profile can open that card again after it is dismissed. The signed-out landing does not show it.

## Sub-features

- `install-home-card` shows the card on Your groups about two seconds after sign-in.
- `install-not-now` hides the card. A later visit in the same browser tab stays hidden. Profile can open it again.
- `install-dont-show` hides the home card until the person asks again from Profile.
- `install-profile` opens the same card from Profile.

## How to get to it (user POV)

- Sign in, land on Your groups, and wait. The card sits above the group list or the empty state.
- Choose `Not now` or `Don't show again` on that card.
- In navigation `App navigation`, choose `Profile`. Under the name, the section `Home screen` has `Add to Home Screen`.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice (`VERIFY_ALICE_EMAIL`, `SPLITWISER_VERIFY_SECRET`).
- Clear site data for `http://127.0.0.1:3017` before the first proof so an earlier dismiss does not hide the card.

- **Home card.** After verify sign-in, stay on Your groups. Within a few seconds a card appears above the list. It offers `Install`, or it lists Share and Add to Home Screen, or it tells you to use the browser menu. It also offers `Not now` and `Don't show again`. The tab bar and `Add expense` stay visible. Screenshot `install-home.png`.
- **Not now.** Choose `Not now`. The card leaves. Reload Your groups. The card does not return. Screenshot `install-snoozed.png`.
- **Profile reopen.** Choose `Profile`. Choose `Add to Home Screen`. The card is visible again. Screenshot `install-profile.png`.
- **Don't show again.** Choose `Don't show again`. Go to Your groups and reload. The card stays gone. Profile still has `Add to Home Screen`.

## Gotchas

- The card is not on the signed-out landing, Friends, or a group.
- An installed app (home screen, without the browser bar) does not show the home card.
- Desktop Chrome may show menu instructions instead of `Install`. That is still the card.
- `Not now` lasts about seven days. Proof in one tab is the reload, not a clock change.
