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
            Sign in with Google to create groups and join invite links.
          </p>
        </div>
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
