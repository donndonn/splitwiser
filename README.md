# Splitwiser

A simple Splitwise-style PWA for friends and family. Create groups, invite people with Google sign-in, add expenses with flexible or itemized splits, scan receipts, and settle up.

## Features

- Groups with Google sign-in and invite links
- Equal, exact, percent, shares, and itemized splits
- Receipt scan: camera or library photo → Gemini parse → prefill (split equally or assign items)
- Receipt photos compressed on-device and stored in a **private** Vercel Blob store (group members only)
- Describe an expense in text and prefill the form (same Gemini key)
- Settle up and record payments
- Installable PWA

## Stack

- Next.js 16 (App Router, Server Actions)
- Neon Postgres + Drizzle ORM
- Auth.js (Google)
- Tailwind CSS v4 + shadcn/ui
- Google Gemini (`gemini-3.5-flash-lite`) for receipt/expense parse — optional
- Vercel Blob (private) for receipt photos
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

4. Optional: add `GOOGLE_API_KEY` from [Google AI Studio](https://aistudio.google.com/) for receipt scan and expense text parse. The app runs without it; scan/parse fail with a clear error if the key is missing.

5. Optional: add a [private Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage) store for receipt photos.
   - On Vercel: Storage → Create → Blob → **Private**, then connect it to this project (OIDC is used automatically).
   - Locally: copy `BLOB_READ_WRITE_TOKEN` from the store into `.env.local`.

6. Install and migrate:

```bash
npm install
npm run db:migrate
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm test` | Run unit tests |

## Deploy to Vercel

1. Import this repo into Vercel.
2. Add Neon from the Vercel Marketplace (injects DB URLs).
3. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
4. Optional: set `GOOGLE_API_KEY` for receipt/expense AI parse (app runs without it; scan fails gracefully if missing).
5. Add a **private** Vercel Blob store (Storage → Blob → Private) and connect it to the project.
6. In Google Cloud Console, add production redirect URI:
   `https://<your-domain>/api/auth/callback/google`
7. Publish the OAuth consent screen (email + profile only — no verification review needed).
8. For preview deployments, set `AUTH_REDIRECT_PROXY_URL` to your production URL.
9. Run migrations once against the Neon database (`npm run db:migrate` with production `DATABASE_URL_UNPOOLED`).
10. Deploy.

See [DEPLOY.md](./DEPLOY.md) for a more detailed checklist.

## Receipt photos

Scanned receipts are compressed in the browser, uploaded to a **private** Vercel Blob store, and served only through `/api/receipts/[expenseId]` after a group-membership check. Neon stores a pathname pointer, never image bytes. Public Blob URLs are not used.

## License

Private / personal use.
