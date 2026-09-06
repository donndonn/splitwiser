/** Local verification accounts use this reserved suffix. Never a real mailbox. */
export const VERIFY_EMAIL_DOMAIN = "splitwiser.invalid";

export function isVerifyAuthEnabled(): boolean {
  return (
    Boolean(process.env.SPLITWISER_VERIFY_SECRET) &&
    process.env.NODE_ENV !== "production"
  );
}

export function isVerifyEmail(email: string): boolean {
  return email.endsWith(`@${VERIFY_EMAIL_DOMAIN}`);
}
