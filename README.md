# Splitwiser

A simple Splitwise-style PWA for friends and family. Create groups, invite people with Google sign-in, add expenses with flexible splits, and settle up.

## Stack

- Next.js 16 (App Router, Server Actions)
- Neon Postgres + Drizzle ORM
- Auth.js (Google)
- Tailwind CSS v4 + shadcn/ui
- Installable PWA

## Local development

1. Copy env vars:

```bash
cp .env.example .env.local
```

2. Create a [Neon](https://neon.tech) project (or add Neon from the Vercel Marketplace) and paste `DATABASE_URL` / `DATABASE_URL_UNPOOLED` into `.env.local`.

3. Create a Google OAuth client:
   - Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web)
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Paste client ID/secret into `.env.local`
   - Generate `AUTH_SECRET` with `openssl rand -base64 32`

4. Install and migrate:

```bash
npm install
npm run db:migrate
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm test` | Run money/split unit tests |

## Deploy to Vercel

1. Import this repo into Vercel.
2. Add Neon from the Vercel Marketplace (injects DB URLs).
3. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
4. In Google Cloud Console, add production redirect URI:
   `https://<your-domain>/api/auth/callback/google`
5. Publish the OAuth consent screen (email + profile only — no verification review needed).
6. For preview deployments, set `AUTH_REDIRECT_PROXY_URL` to your production URL.
7. Run migrations once against the Neon database (`npm run db:migrate` with production `DATABASE_URL_UNPOOLED`).
8. Deploy.

## Phase 2 (not built)

Receipt upload via Vercel Blob + Gemini parsing to prefill expense forms.

## License

Private / personal use.
