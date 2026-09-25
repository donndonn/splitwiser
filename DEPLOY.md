# Deployment checklist

## 1. Neon database

1. In the [Vercel dashboard](https://vercel.com), open the project → **Storage** → **Create** → **Neon**.
2. Or create a project at [neon.tech](https://neon.tech) and copy:
   - `DATABASE_URL` (pooled)
   - `DATABASE_URL_UNPOOLED` (direct)

## 2. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://<your-domain>/api/auth/callback/google` (production)
3. OAuth consent screen → **Publish** (email + profile scopes only; no verification needed).
4. Copy Client ID and Client Secret.

## 2b. Sign in with Apple (production)

Apple rejects `http://localhost`. Configure this on the production domain only. The App ID, Services ID, key, domain, and return URL are already registered in Apple Developer — do not recreate them. Do not commit the `.p8` or put the Team ID / Key ID in source.

1. `AUTH_APPLE_ID` is the Services ID (OAuth client id), not the App ID.
2. Generate `AUTH_APPLE_SECRET` (a JWT, maximum lifetime 6 months):

   ```bash
   npx auth add apple
   ```

   The CLI prompts for Team ID, Key ID, Services ID, and the `.p8`. Paste the printed secret into Vercel. Rotate it before it expires and redeploy.
3. Return URL already registered for the Services ID:
   `https://splitwiser-lime.vercel.app/api/auth/callback/apple`
4. Set both variables on the **Production** environment (not Preview). Preview deployments cannot reuse this Services ID. Auth.js also ignores `AUTH_REDIRECT_PROXY_URL` for Apple because the callback is `response_mode=form_post`.
5. The app still builds and the verify credentials form still works when these variables are unset. The Apple button then fails only when someone submits it.

Account linking: the same verified email as an existing Google user is linked onto that user (`allowDangerousEmailAccountLinking`). Hide My Email shares a private-relay address (`…@privaterelay.appleid.com`) that will not match the Google mailbox, so that person gets a separate Splitwiser user. Apple sends email and name only on the first consent; later sign-ins resolve the existing `accounts` row (`provider = apple`, Apple user id). No schema change is required.

## 3. Vercel project

```bash
npx vercel link
npx vercel env add AUTH_SECRET
npx vercel env add AUTH_GOOGLE_ID
npx vercel env add AUTH_GOOGLE_SECRET
npx vercel env add AUTH_APPLE_ID production
npx vercel env add AUTH_APPLE_SECRET production
# DATABASE_URL vars come from Neon marketplace integration
# BLOB_READ_WRITE_TOKEN / OIDC come from connecting a private Blob store
npx vercel --prod
```

Generate secret: `openssl rand -base64 32`

Optional — receipt scan and expense text parse ([Google AI Studio](https://aistudio.google.com/)):

```bash
npx vercel env add GOOGLE_API_KEY
```

The app runs without `GOOGLE_API_KEY`; scan/parse fail with a clear error if it is missing.

Optional for preview deployments:

```bash
npx vercel env add AUTH_REDIRECT_PROXY_URL
# value = https://your-production-domain.com
```

## 4. Private Vercel Blob (receipt photos)

1. Vercel dashboard → project → **Storage** → **Create** → **Blob**.
2. Set access to **Private** (do not use a public store).
3. Connect the store to this project. On Vercel, the SDK authenticates with OIDC (`BLOB_STORE_ID`).
4. For local development, copy `BLOB_READ_WRITE_TOKEN` from the store into `.env.local`.

Receipt images are never served from public Blob URLs. Group members view them through `/api/receipts/[expenseId]`.

## 5. Run migrations

```bash
# with production unpooled URL in .env.local or exported:
npm run db:migrate
```

## 6. Install as PWA

- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: menu → Install app / Add to Home screen

## 7. Invitations and the account cap

New accounts can only be created by opening a group invitation link and continuing with Google or Apple. Each group has one current link, valid for 30 days or 15 joins. An account counts toward the cap from its first successful sign-in, before it joins a group; until it joins, it can only see invitation and onboarding pages. It also reserves one of its link's 15 joins, so one link can never create more than 15 accounts; the reservation becomes a join when the account joins through that link (Members shows these as pending signups). Existing accounts always keep signing in, even when the app is full.

The cap lives in the singleton `app_settings` row and is read on every signup (no redeploy needed). Change it from `/admin` (see below), or run these against the production database (Neon SQL editor or `psql "$DATABASE_URL_UNPOOLED"`).

Inspect accounts:

```sql
select
  count(*)                                              as total_accounts,
  count(*) filter (where onboarding_completed_at is null) as pending_signups,
  (select max_users from app_settings where id = 1)     as max_users
from users;
```

Change the cap (`0` pauses new accounts; lowering it below the current count removes no one, it only blocks new signups):

```sql
update app_settings set max_users = 750, updated_at = now() where id = 1;
```

If the `app_settings` row is missing, new signups are refused and existing accounts still sign in. Restore it with `insert into app_settings (id, max_users) values (1, 500);`.

Rejected signups are logged as `[admission] new account rejected` with a `reason` (`invite_required`, `invite_unavailable`, `full`, `closed`). Link resets and disables are logged as `[invites] invitation replaced`. Tokens and provider credentials are never logged.

### Site admin (`/admin`)

Set `ADMIN_EMAILS` (comma-separated, case-insensitive) in the Vercel project's environment variables and redeploy. An onboarded account whose email is listed can open `/admin`; everyone else, signed out included, gets a 404. The page is not linked from the app.

- **Overview**: accounts against the cap, pending signups, recent admin actions.
- **Account cap**: set `max_users` (`0` pauses signups). Lowering it below the current count removes no one.
- **Unfinished signups**: delete pending accounts older than 7 days, freeing their cap slots and their invite links' reserved joins.
- **Users** (`/admin/users`): search by name, email, or username; filter active/pending; open a user to see their groups. Accounts created before migration `0012` show no signup date.
- **Invite links** (`/admin/invites`): every group's current link; revoke any of them.

Every change is recorded in the `admin_actions` table (actor email, action, details) and logged as `[admin] …`.

### First owner on an empty database

There is no public signup bypass. To bootstrap a fresh database, insert the owner's account directly, using the email of their Google account:

```sql
insert into users (id, name, email, onboarding_completed_at)
values (gen_random_uuid()::text, 'Owner Name', 'owner@example.com', now());
```

Then sign in with Google using that email. Auth.js links the Google identity to this row by email, so no invitation is required. Apple "Hide My Email" addresses will not match; use Google or the real Apple ID email. After that, the owner creates a group and shares its invitation link.

### Rollout of invitation-only signup (migration `0011`)

`npm run db:migrate` creates `app_settings` with a 500-account cap, marks every existing account as onboarded, and revokes all existing invitation links (admins create new ones from Members). Memberships are unchanged. Run the migration, then deploy.

