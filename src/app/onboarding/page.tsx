import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { requireSignedIn } from "@/lib/auth-guards";
import { countInviteReservations, inviteStatus } from "@/lib/invites";

/**
 * Where unfinished signups land. Resumes the signup invitation while it is
 * still valid; otherwise explains how to get a new group link.
 */
export default async function OnboardingPage() {
  const user = await requireSignedIn("/onboarding");
  if (user.onboarded) redirect("/");

  if (user.signupInviteId) {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, user.signupInviteId))
      .limit(1);
    if (
      invite &&
      inviteStatus(
        invite,
        new Date(),
        await countInviteReservations(db, invite.id, user.id),
      ) === "live"
    ) {
      redirect(`/join/${encodeURIComponent(invite.token)}`);
    }
  }

  return (
    <AppShell title="Finish joining">
      <Card>
        <CardHeader>
          <CardTitle>Join a group to get started</CardTitle>
          <CardDescription>
            Your account is ready, but the invitation you signed up with is no
            longer valid. Ask someone in your group to share a new invitation
            link, then open it while signed in as {user.email ?? "this account"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
