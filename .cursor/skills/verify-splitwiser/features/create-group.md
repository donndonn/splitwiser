# Create a group

Create a group lets a signed-in user name a group, pick their display name and currency, and land on that group's home with an empty expense list.

## Sub-features

- `group-open-form` opens the new-group form from home.
- `group-save` persists name, display name, and currency.
- `group-home` shows the new group dashboard with `All settled up`.
- `group-list` lists the group on `Your groups` after leaving home.

## How to get to it (user POV)

- On `Your groups`, choose `Create group`.
- Go to `http://127.0.0.1:3017/new` while signed in.

## Driving it with Cursor browser

Preconditions:

- Splitwiser is healthy at `http://127.0.0.1:3017`.
- Signed in as Alice (`VERIFY_ALICE_EMAIL`) via `Verify sign-in`.
- `GROUP_NAME_PREFIX` is known from `verify-splitwiser show`.
- No group titled `<GROUP_NAME_PREFIX> Cabin` exists yet.

- **Open form from home.** On heading `Your groups`, choose link `Create group`. Heading is `New group`. Textboxes `Group name` and `Your name in this group` are visible. The second is prefilled (often `Alice Verify`).
- **Direct URL.** As a second entry, visit `/new` from `Your groups` via the same link or by opening `http://127.0.0.1:3017/new`. The same `New group` heading appears.
- **Fill name.** Fill textbox `Group name` with `<GROUP_NAME_PREFIX> Cabin` (example: `swv-a1b2c3d4 Cabin`). Leave `Your name in this group` as `Alice Verify` unless it is empty.
- **Currency.** Leave `Currency` on `USD` unless the recipe under test is a currency change.
- **Create.** Choose button `Create group`. The group home heading is `<GROUP_NAME_PREFIX> Cabin`. Body includes `Your balance` and `All settled up`. `Add expense` is visible. Screenshot `create-group-home.png`.
- **Confirm list.** Choose link `Back`. Heading `Your groups` shows a row whose name is `<GROUP_NAME_PREFIX> Cabin` and status `settled`. Screenshot `create-group-list.png`.
- **Proof.** Save ARIA snapshots of the `New group` form (filled), the group home heading, and the `Your groups` row. Record that both the home button and `/new` were considered; if only one was used, say which and why the other was skipped.

## Gotchas

- A group name without the `swv-<RUN_ID>` prefix survives cleanup and pollutes the shared database. Always prefix.
- `Create group` appears twice: the home link and the form submit button. The form submit is the button on `New group`.
- A click on `Create group` or `Back` can lag before the next snapshot. Wait and snapshot again, or open `/new` and `/` directly — both are mapped entry points.
- Creating a group with an empty name is blocked by the required `Group name` field. Do not treat a stay-on-form as a save.
- Friends checkboxes only appear if Alice already has friends. Baseline create-group does not require them; adding friends belongs to the friends feature.
