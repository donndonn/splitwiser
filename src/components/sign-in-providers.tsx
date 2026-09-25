import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { startInviteSignInAction } from "@/lib/invite-sign-in";

/**
 * With `inviteToken`, sign-in starts from that invitation so a new account
 * can be created; otherwise only existing accounts can sign in.
 */
export function SignInProviders({
  redirectTo,
  inviteToken,
}: {
  redirectTo: string;
  inviteToken?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form
        action={async () => {
          "use server";
          if (inviteToken) {
            await startInviteSignInAction(inviteToken, "google");
          } else {
            await signIn("google", { redirectTo });
          }
        }}
      >
        <Button type="submit" size="lg" className="w-full">
          Continue with Google
        </Button>
      </form>
      <form
        action={async () => {
          "use server";
          if (inviteToken) {
            await startInviteSignInAction(inviteToken, "apple");
          } else {
            await signIn("apple", { redirectTo });
          }
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
