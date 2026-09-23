import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOptionalUser } from "@/lib/auth-guards";
import { isVerifyAuthEnabled } from "@/lib/verify-auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const user = await getOptionalUser();
  if (user) {
    redirect(callbackUrl || "/");
  }

  return (
    <AppShell title="Sign in" backHref="/">
      <div className="mx-auto flex max-w-sm flex-col gap-6 py-8 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with Google or Apple to create groups and join invite
            links.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: callbackUrl || "/",
              });
            }}
          >
            <Button type="submit" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("apple", {
                redirectTo: callbackUrl || "/",
              });
            }}
          >
            <Button
              type="submit"
              size="lg"
              className="w-full border-black bg-black text-white shadow-none hover:bg-neutral-800 focus-visible:border-black dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:border-white"
            >
              <AppleMark />
              Continue with Apple
            </Button>
          </form>
        </div>
        {isVerifyAuthEnabled() ? (
          <form
            className="space-y-3 text-left"
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: String(formData.get("email") ?? ""),
                secret: String(formData.get("secret") ?? ""),
                redirectTo: callbackUrl || "/",
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

function AppleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="currentColor"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
