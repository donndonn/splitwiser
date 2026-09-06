---
name: verify-splitwiser
description: Drive the Splitwiser web PWA (Next.js at http://127.0.0.1:3017) the way a user would — launch an isolated instance, sign in with local verify credentials, exercise groups, expenses, friends, and balances, and capture proof. Use when verifying Splitwiser UI behavior after changing routes, auth, expense/group flows, or before claiming a feature works.
---

# Verify Splitwiser

Splitwiser is a Next.js 16 App Router PWA. Users create groups, add expenses with splits, invite people, and settle balances. Google OAuth is the production sign-in path. Verification never completes Google OAuth. Local runs enable a gated credentials form on `/signin` when `SPLITWISER_VERIFY_SECRET` is set and `NODE_ENV` is not `production`.

Primary surface: the web UI. There is no CLI, no Playwright harness, and no public API besides Auth.js and server actions behind the UI. Drive the UI with the Cursor IDE browser (CDP). Unit tests (`npm test`) are not a substitute for this skill.

## Launch

From the repo root, start a verification instance. Do not attach to `localhost:3000`, `localhost:3001`, or any server you did not start.

```bash
.cursor/skills/verify-splitwiser/bin/verify-splitwiser launch
```

This helper:

- Refuses if another verification run is still live or if port `3017` is already taken.
- Starts a detached `npm run dev -- --port 3017 --hostname 127.0.0.1` via `lib/start-server.mjs` (`child.unref()`, new process group) with `AUTH_URL=http://127.0.0.1:3017`, a generated `SPLITWISER_VERIFY_SECRET`, and `SPLITWISER_VERIFY_DISTDIR=.next-verify` so this instance does not collide with a developer `next dev` that already holds `.next` (Next.js allows only one dev server per dist directory).
- Waits until `GET http://127.0.0.1:3017/` succeeds.
- Writes state under `.cursor/skills/verify-splitwiser/.run/<RUN_ID>/` and prints `RUN_ID`, `URL`, `STATE`, `ARTIFACTS`.

Ready signal: the helper exits 0 and prints `Ready`. The server log at `.run/<RUN_ID>/server.log` contains Next.js `Ready`.

Then seed Alice and Bob (emails `@splitwiser.invalid`) and confirm the instance is worth driving:

```bash
.cursor/skills/verify-splitwiser/bin/verify-splitwiser seed
.cursor/skills/verify-splitwiser/bin/verify-splitwiser doctor
.cursor/skills/verify-splitwiser/bin/verify-splitwiser show
```

`show` prints `URL`, `SPLITWISER_VERIFY_SECRET`, `VERIFY_ALICE_EMAIL`, `VERIFY_BOB_EMAIL`, and `GROUP_NAME_PREFIX`. Use those values as literals in the browser. Group names created during a run must start with `GROUP_NAME_PREFIX` (example: `swv-a1b2c3d4 Cabin`).

Preconditions the helper does not create: `.env.local` must exist with `DATABASE_URL` and `AUTH_SECRET`. That database is the same Neon instance as local development — not an isolated data dir. Isolation is by `swv-<RUN_ID>` prefixes, not by a throwaway database.

Teardown is `cleanup` in the Cleanup section. After a failed launch, run cleanup for the printed `RUN_ID` if a pid file exists.

## Doctor

Run this first whenever anything looks off:

```bash
.cursor/skills/verify-splitwiser/bin/verify-splitwiser doctor
```

It is read-only. Success prints `ok run=... url=http://127.0.0.1:3017 ...` and Alice's email. Failure means stop driving. Typical causes:

- Process in `.run/<RUN_ID>/pid` is dead.
- Port 3017 is not owned by that process tree (shared instance — refuse).
- `/` does not contain `Splitwiser`.
- `/signin` lacks `Verify sign-in` (server started without `SPLITWISER_VERIFY_SECRET`).
- `fixtures.json` missing (seed was skipped).

## Drive

Use the Cursor IDE browser against `http://127.0.0.1:3017` only. Read `features/README.md`, then the matching feature file. A proof that uses one convenient entry point is incomplete when the map lists others.

Browser workflow:

1. `browser_tabs` list. Navigate the verification URL if needed (`browser_navigate` to `http://127.0.0.1:3017/...`).
2. `browser_lock` with `action: "lock"` before interacting.
3. `browser_snapshot` for refs. Prefer role + accessible name. Do not use coordinates or tab order.
4. Interact with `browser_click` / `browser_fill` / `browser_type` / `browser_press_key`.
5. Snapshot again after each mutation. Unlock when the whole drive is done.

Stable handles in this repo:

| What | Handle |
| --- | --- |
| Signed-out home heading | `Splitwiser` |
| Open sign-in | link `Sign in with Google` |
| Sign-in heading | `Welcome back` |
| Production OAuth (do not complete) | button `Continue with Google` |
| Verify email | textbox `Verify email` |
| Verify secret | textbox `Verify secret` |
| Submit verify session | button `Verify sign-in` |
| Signed-in home heading | `Your groups` |
| App tabs | navigation `App navigation` → `Groups`, `Friends`, `Profile` |
| Create group | link `Create group` → heading `New group` |
| Group name | textbox `Group name` |
| Display name in group | textbox `Your name in this group` |
| Submit group | button `Create group` |
| Group home Add | link `Add expense` or tab `Add` |
| Skip Gemini prefill | button `Enter manually` |
| Expense description | textbox `What was it for?` |
| Expense amount | textbox whose name starts with `Amount` |
| Save expense | button `Add expense` |
| Group tabs | `Home`, `Add`, `Balances`, `Activity`, `Members` |
| Members placeholder | textbox placeholder `Name` + button `Add` |
| Friends search | heading `Find friends`; textbox placeholder `email or @username`; button `Search` |
| Sign out | heading `Profile`; button `Sign out` |
| Back | link `Back` |

Do not click `Continue with Google`. That leaves the app for Google's OAuth screen and cannot be completed by this harness.

Gemini (`Fill form`, `Scan receipt`) calls Google. Skip those sub-features unless the map's gotchas say to run them and `GOOGLE_API_KEY` is present. Manual expense entry is the default proof path.

After signing in as Alice, `show` emails are the values to type. To switch users, sign out from Profile, then verify-sign-in as Bob.

## Evidence

Store proof in `.cursor/skills/verify-splitwiser/artifacts/<RUN_ID>/`. Cleanup must not delete that directory. Cursor browser screenshots may also write under a temp `.../T/cursor/screenshots/` prefix; copy them into the artifacts directory if they did not land there.

Proof standards:

- Drive the real UI. Do not insert groups/expenses/friends with SQL except the seeded Alice/Bob users. Do not call test-only endpoints.
- Capture the action and the resulting state, not only the final screen. For a mutation: snapshot or screenshot before, the control you used, and the page after.
- Re-read the value from a second user-facing view (list, group home, activity) after save. A toast or redirect alone is not enough.
- UI proof: an ARIA snapshot (browser_snapshot saved to `*.aria.yml` or pasted into `notes.md`) plus a screenshot that shows the Splitwiser chrome (heading `Your groups` / group name / `Add expense`).
- Record the feature ID and entry point in `artifacts/<RUN_ID>/notes.md`.
- Side effects live in the shared Neon DB. Confirm them in the UI (second view), not by querying Postgres, unless the UI cannot show the value.
- Google OAuth, Gemini parse, and receipt scan are production boundaries. Mocking them means using verify credentials and `Enter manually`. If you skip a mapped entry point, report it as skipped with the unmet precondition — do not claim it passed via a different path.

Suggested filenames: `artifacts/<RUN_ID>/<feature-id>-before.png`, `<feature-id>-after.png`, `<feature-id>.aria.yml`.

## Cleanup

Kill only the process tree this run started. Never `pkill next` or kill by process name.

```bash
.cursor/skills/verify-splitwiser/bin/verify-splitwiser cleanup
```

Cleanup:

- Kills the pid recorded at launch (children included).
- Deletes DB rows for `swv-<RUN_ID>-*@splitwiser.invalid` users and groups whose names start with `swv-<RUN_ID>`.
- Removes `.run/<RUN_ID>/`.
- Leaves `.cursor/skills/verify-splitwiser/artifacts/<RUN_ID>/` in place.

If the run created a group whose name does not start with `GROUP_NAME_PREFIX`, cleanup will not delete it. That is a failed run: name it correctly or delete it from Settings → the group delete control before cleanup.

## Helpers

`bin/verify-splitwiser` is executable. Invoke it from the repo root (or with the path above). Subcommands:

```bash
.cursor/skills/verify-splitwiser/bin/verify-splitwiser launch
.cursor/skills/verify-splitwiser/bin/verify-splitwiser seed [RUN_ID]
.cursor/skills/verify-splitwiser/bin/verify-splitwiser doctor [RUN_ID]
.cursor/skills/verify-splitwiser/bin/verify-splitwiser show [RUN_ID]
.cursor/skills/verify-splitwiser/bin/verify-splitwiser cleanup [RUN_ID]
```

Omitting `RUN_ID` uses `.run/current`. `launch` calls `lib/start-server.mjs` (detached `npm run dev`). `seed` and `cleanup` call `lib/fixtures.mjs`. Do not run those Node scripts by hand unless the CLI is broken.

## Isolate

Two verification instances cannot share port 3017. The helper refuses a second launch while the first pid is alive. Do not start a second verification `next dev` to work around that.

A developer `next dev` on port 3000/3001 can keep running. Verification uses distDir `.next-verify` and port 3017. Never drive the developer's URL — that process does not have `SPLITWISER_VERIFY_SECRET` and shares the user's session.

The database is shared with the developer’s Neon project. Do not drive against production. Do not mutate groups that lack the `swv-<RUN_ID>` name prefix.
