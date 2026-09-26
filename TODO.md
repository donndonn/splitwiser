# TODO

Created: 2026-09-26 · Updated: 2026-09-26

## Phone verification (parked 2026-09-26)

Friend search by phone number and SMS verification via Twilio Verify are
built and tested, but not live. Blocked on upgrading the Twilio account:
trial accounts can't create a Verify service.

Until the three `TWILIO_*` variables are set, the profile page hides the
Phone section and search finds no one by phone. The top-sheet fix for the
keyboard covering Find friends ships regardless.

- [ ] Upgrade the Twilio account (prepaid balance, about $20; turn auto-recharge off or cap it)
- [ ] Create a Verify service (Verify → Services → Create, SMS on); copy the `VA…` Service SID
- [ ] Twilio: limit Verify Geo Permissions to US and Taiwan (matches `SMS_COUNTRIES` in `src/lib/phone.ts`); turn on Fraud Guard
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` in `.env.local`
- [ ] `npm run db:migrate` (applies `drizzle/0013_phone_verification.sql`)
- [ ] Test on a phone: add number → code → verify; find that account from another by phone
- [ ] Add the same variables to Vercel (`npx vercel env add …`), migrate production, deploy

Details: `DEPLOY.md` (Twilio section). Code: `src/lib/phone-verification.ts`,
`src/lib/twilio-verify.ts`, `src/app/profile/phone-section.tsx`.
