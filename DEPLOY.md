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

## 3. Vercel project

```bash
npx vercel link
npx vercel env add AUTH_SECRET
npx vercel env add AUTH_GOOGLE_ID
npx vercel env add AUTH_GOOGLE_SECRET
# DATABASE_URL vars come from Neon marketplace integration
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

## 4. Run migrations

```bash
# with production unpooled URL in .env.local or exported:
npm run db:migrate
```

## 5. Install as PWA

- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: menu → Install app / Add to Home screen
