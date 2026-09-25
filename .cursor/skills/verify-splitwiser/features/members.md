# Members

Members lets a group admin add a placeholder person, add an accepted friend, and manage the group's single invite link (create, share, reset, disable).

## Sub-features

- `members-open` opens Members from the group tab bar.
- `members-placeholder` adds a person by name who cannot sign in.
- `members-add-friend` adds an accepted friend as a linked member.
- `members-invite` creates the group's invite link and shows `/join/…` with `0 of 15 joins used`.
- `members-invite-reset` replaces the link with a new `/join/…` token.
- `members-invite-disable` disables the link and offers `Create new link`.

## How to get to it (user POV)

- On a group, choose tab `Members`.
- Open `http://127.0.0.1:3017/g/<id>/members` while signed in as a member.

## Driving it with Cursor browser

Preconditions:

- Signed in as Alice, who is an admin of `<GROUP_NAME_PREFIX> Cabin`.
- Alice and Bob are already friends (friends recipe). Bob is not in the group yet.
- No placeholder named `Sam` is in the group yet.

- **Open.** Choose tab `Members`. Heading is `Members`. The roster includes `Alice Verify`. Sections `Add from friends`, `Add people by name`, and `Invite link` are visible.
- **Placeholder.** In `Add people by name`, fill the textbox whose placeholder is `Name` with `Sam`. Choose `Add`. The roster includes `Sam`. Screenshot `members-sam.png`.
- **Friend.** Under `Add from friends`, the row `Bob Verify` has button `Add`. Choose `Add`. Toast `Added Bob Verify`. The roster includes `Bob Verify`. `Add from friends` then says no friends are left to add (or Bob’s row is gone). Screenshot `members-bob.png`.
- **Invite.** Under `Invite link`, choose `Create link`. On desktop the toast is `Invite link copied` (there is no share sheet). The panel shows a `/join/` token and `0 of 15 joins used · expires <date about 30 days out>`. Buttons `Share / Copy link`, `Reset link`, and `Disable` are visible. There are no expiry or max-use inputs. Screenshot `members-invite.png`.
- **Reset.** Note the token. Choose `Reset link`; a dialog `Reset invite link?` opens. Choose `Reset link` in the dialog. The toast is `Invite link copied`, and the panel shows a different `/join/` token. Screenshot `members-invite-reset.png`.
- **Disable.** Choose `Disable`; dialog `Disable invite link?` opens. Choose `Disable link`. Toast `Invite link disabled`. The token is struck through, the panel says `This link is disabled.`, and the only button is `Create new link`. Screenshot `members-invite-disabled.png`.
- **Old link.** Open the struck-through `/join/…` URL in the same session. Alice is a member, so the app goes straight to the group home. Then choose tab `Members` again and choose `Create new link` so later recipes have a live link.
- **Second view.** Stay on Members. The roster still shows `Alice Verify`, `Sam`, and `Bob Verify`. Do not open the join URL in a way that drops Alice’s session.
- **Proof.** Save the roster after Sam, the roster after Bob, and the invite panel in live, reset, and disabled states. Record the toast text.

## Gotchas

- Only admins see invite and placeholder controls. Alice is the creator, so she is an admin.
- `Add` on this page is not the friend-search `Add`. The placeholder form has its own `Add` button with the same name. Use the button on Bob’s row under `Add from friends`.
- `Create link`, `Reset link`, and `Share / Copy link` call the browser share sheet when `navigator.share` exists, and copy to the clipboard otherwise. A cancelled share sheet still creates the link without the copied toast. The panel is the proof either way.
- Unfinished signups admitted by the link hold one of its joins; the panel shows them as `N pending signups`, and they count toward the 15.
- Each group has at most one current link. Existing links from before the invite-only rollout show as disabled.
- Placeholder `Sam` cannot sign in. Bob can. Adding Bob is what the profile Venmo recipe needs.
