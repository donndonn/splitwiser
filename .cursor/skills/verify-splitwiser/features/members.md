# Members

Members lets a group admin add a placeholder person, add an accepted friend, and create an invite link that shows up under Invite links.

## Sub-features

- `members-open` opens Members from the group tab bar.
- `members-placeholder` adds a person by name who cannot sign in.
- `members-add-friend` adds an accepted friend as a linked member.
- `members-invite` creates an invite link and lists `/join/…`.

## How to get to it (user POV)

- On a group, choose tab `Members`.
- Open `http://127.0.0.1:3017/g/<id>/members` while signed in as a member.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice, who is an admin of `<GROUP_NAME_PREFIX> Cabin`.
- Alice and Bob are already friends (friends recipe). Bob is not in the group yet.
- No placeholder named `Sam` is in the group yet.

- **Open.** Choose tab `Members`. Heading is `Members`. The roster includes `Alice Verify`. Sections `Add from friends`, `Add people by name`, and `Create invite link` are visible.
- **Placeholder.** In `Add people by name`, fill the textbox whose placeholder is `Name` with `Sam`. Choose `Add`. The roster includes `Sam`. Screenshot `members-sam.png`.
- **Friend.** Under `Add from friends`, the row `Bob Verify` has button `Add`. Choose `Add`. Toast `Added Bob Verify`. The roster includes `Bob Verify`. `Add from friends` then says no friends are left to add (or Bob’s row is gone). Screenshot `members-bob.png`.
- **Invite.** Under `Create invite link`, leave `Expires` on `7 days` and `Max uses` empty. Choose `Create & share link`. On desktop the toast is `Invite link copied` (there is no share sheet). A link containing `/join/` appears in the form. Section `Invite links` lists a `/join/` token. Screenshot `members-invite.png`.
- **Second view.** Stay on Members. The roster still shows `Alice Verify`, `Sam`, and `Bob Verify`, and `Invite links` still shows the token. Do not open the join URL in a way that drops Alice’s session.
- **Proof.** Save the roster after Sam, the roster after Bob, and the invite link row. Record the toast text.

## Gotchas

- Only admins see invite and placeholder controls. Alice is the creator, so she is an admin.
- `Add` on this page is not the friend-search `Add`. Use the button on Bob’s row under `Add from friends`.
- `Create & share link` calls the browser share sheet when `navigator.share` exists, and copies to the clipboard otherwise. A cancelled share sheet creates the link without the copied toast. The `Invite links` row is the proof either way.
- Do not choose `Revoke` during proof. Cleanup removes the group.
- Placeholder `Sam` cannot sign in. Bob can. Adding Bob is what the profile Venmo recipe needs.
