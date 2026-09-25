import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { SignInProviders } from "@/components/sign-in-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOptionalUser } from "@/lib/auth-guards";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { isVerifyAuthEnabled } from "@/lib/verify-auth";

function signInErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case undefined:
      return null;
    case "invite_required":
      return "No Splitwiser account was found. New users need a group invitation link to sign up — ask someone in your group to share one.";
    case "invite_unavailable":
      return "That invitation is no longer valid. Ask a group admin for a new link.";
    case "full":
      return "Splitwiser is currently full and isn't accepting new accounts. Existing users can still sign in.";
    case "closed":
      return "Splitwiser isn't accepting new accounts right now. Existing users can still sign in.";
    default:
      return "Sign-in didn't complete. Please try again.";
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl: rawCallbackUrl, error } = await searchParams;
  const callbackUrl = safeCallbackPath(rawCallbackUrl);
  const user = await getOptionalUser();
  if (user) {
    redirect(user.onboarded ? callbackUrl : "/onboarding");
  }
  const errorMessage = signInErrorMessage(error);

  return (
    <AppShell title="Sign in" backHref="/">
      <div className="mx-auto flex max-w-sm flex-col gap-6 py-8 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with Google or Apple. New to Splitwiser? Open the group
            invitation link someone shared with you to sign up.
          </p>
        </div>
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}
        <SignInProviders redirectTo={callbackUrl} />
        {isVerifyAuthEnabled() ? (
          <form
            className="space-y-3 text-left"
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: String(formData.get("email") ?? ""),
                secret: String(formData.get("secret") ?? ""),
                redirectTo: callbackUrl,
              });
            }}
          >
            <h3 className="text-center text-sm font-medium">
              Verification sign-in
            </h3>
            <div className="space-y-2">
              <Label htmlFor="verify-email">Verify email</Label>
              <Input
                id="verify-email"
                name="email"
                type="email"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-secret">Verify secret</Label>
              <Input
                id="verify-secret"
                name="secret"
                type="password"
                autoComplete="off"
                required
              />
            </div>
            <Button type="submit" size="lg" className="w-full" variant="secondary">
              Verify sign-in
            </Button>
          </form>
        ) : null}
        <p className="text-xs text-muted-foreground">
          By continuing you agree to use this app for personal expense
          splitting with people you trust.
        </p>
        <Button asChild variant="ghost">
          <Link href="/">Cancel</Link>
        </Button>
      </div>
    </AppShell>
  );
}
