# Friends

Friends lets a signed-in user find another user by email or @username, send a request, accept it from the other account, and see the person under Your friends.

## Sub-features

- `friends-open` opens Friends from app navigation.
- `friends-search-miss` shows no user found for an unknown query.
- `friends-request` sends a request from Alice to Bob.
- `friends-accept` accepts the request while signed in as Bob.
- `friends-list` shows the other person under Your friends for both users.

## How to get to it (user POV)

- In navigation `App navigation`, choose `Friends`.
- Go to `http://127.0.0.1:3017/friends`.
- From the new-group form copy `Invite friends first` when Alice has no friends.

## Driving it with Cursor browser

Preconditions:

- Splitwiser is healthy; Alice and Bob are seeded (`VERIFY_ALICE_EMAIL`, `VERIFY_BOB_EMAIL`, usernames from `show`).
- Start signed in as Alice.
- Alice and Bob are not already friends. If they are leftovers from a crashed run, cleanup and re-seed.

- **Open Friends.** Choose `Friends` in `App navigation`. Heading is `Friends`. Region `Find friends` is visible. Screenshot `friends-empty.png` if `No friends yet` is shown.
- **Search miss.** In the textbox with placeholder `email or @username`, type `nobody-swv-miss@splitwiser.invalid`. Choose `Search`. A `No user found` toast appears and no Add button is shown.
- **Search Bob.** Replace the query with `VERIFY_BOB_EMAIL` (or `@` plus Bob's username). Choose `Search`. A result named `Bob Verify` appears with button `Add`.
- **Send request.** Choose `Add`. The result status becomes `Requested` (or toast `Friend request sent`). Under `Sent requests`, `Bob Verify` is listed with `Pending`.
- **Switch to Bob.** Choose `Profile`, then `Sign out`. Sign in with `VERIFY_BOB_EMAIL` and `SPLITWISER_VERIFY_SECRET`. Open `Friends`. Heading `Friend requests` lists `Alice Verify` with `Accept` and `Decline`.
- **Accept.** Choose `Accept`. `Alice Verify` moves to `Your friends`. Screenshot `friends-bob-list.png`.
- **Confirm as Alice.** Sign out, verify-sign-in as Alice, open `Friends`. `Bob Verify` is under `Your friends`. Screenshot `friends-alice-list.png`.
- **Proof.** Keep snapshots of the miss toast/state, the outgoing pending request, Bob's incoming request, and both final friends lists.

## Gotchas

- Friend search is exact email or @username, not a substring. Do not type `Bob`.
- Alice may see a profile hint to set a username. Seed already sets `swv<RUN_ID>a` / `swv<RUN_ID>b`. Searching `@swv<RUN_ID>b` is valid.
- `Add` on an incoming search result accepts instead of sending. That is why the recipe searches from Alice, not from Bob.
- Do not choose `Remove` during proof. Cleanup deletes the users.
- Switching accounts requires a full sign-out. Using two browser profiles is unnecessary; one profile, sequential sessions, is the intended path.
