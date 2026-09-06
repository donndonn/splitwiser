# Splitwiser verification map

This directory is the maintained source for verifying the user-facing behavior of Splitwiser. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch Splitwiser with `.cursor/skills/verify-splitwiser/bin/verify-splitwiser launch`. The app must be at `http://127.0.0.1:3017`.
- Run `verify-splitwiser seed` then `verify-splitwiser doctor`. Require `ok`, `Verify sign-in` on `/signin`, and Alice/Bob fixtures.
- Run `verify-splitwiser show` and treat `URL`, `SPLITWISER_VERIFY_SECRET`, `VERIFY_ALICE_EMAIL`, `VERIFY_BOB_EMAIL`, and `GROUP_NAME_PREFIX` as literals.
- Never drive an instance that was not started by this verification run. Never use `localhost:3000` or `localhost:3001`.
- Every group created during the run must be named `<GROUP_NAME_PREFIX> <rest>` (example: `swv-a1b2c3d4 Cabin`).
- Sign in through the `/signin` form labeled `Verification sign-in`. Do not complete Google OAuth.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Treat emails, secrets, and group names from `show` as literal. Do not invent addresses.
- Run browser actions through the Cursor IDE browser against `http://127.0.0.1:3017`.
- After a mutation, confirm the value from a second screen (group list, group home, activity, friends list).
- Restore or rely on cleanup for `swv-<RUN_ID>` rows. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with Splitwiser identity visible (app heading or group name).
- Mutation proof includes a read-only second view of the stored value.
- Record the feature ID and entry point used with every artifact under `.cursor/skills/verify-splitwiser/artifacts/<RUN_ID>/`.
- Report an unreachable path with the attempted control and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Cursor browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact control and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign in](./sign-in.md) covers the signed-out landing, Google CTA (do not complete), verify credentials, and sign out.
- [Create a group](./create-group.md) covers creating a named group from the home list.
- [Add an expense](./add-expense.md) covers manual expense entry, equal split, and persistence on group home.
- [Friends](./friends.md) covers search, request, accept, and the friends list.
- [Balances](./balances.md) covers owed amounts, recording a payment, and the settled state.
