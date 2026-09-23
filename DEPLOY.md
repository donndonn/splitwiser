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
