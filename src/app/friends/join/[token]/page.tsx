import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
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
import { friendInvites, users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import {
  areFriends,
  displayNameForUser,
  isInviteLive,
} from "@/lib/friends";
import { acceptFriendInviteAction } from "../../actions";

export default async function FriendJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite] = await db
    .select()
    .from(friendInvites)
    .where(eq(friendInvites.token, token))
    .limit(1);

  if (!invite) {
    return (
      <AppShell title="Friend invite" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This link is invalid. Ask your friend for a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (!isInviteLive(invite)) {
    const message = invite.revokedAt
      ? "This invite was revoked."
      : invite.expiresAt && invite.expiresAt.getTime() < Date.now()
        ? "This invite has expired."
        : "This invite has reached its use limit.";
    return (
      <AppShell title="Friend invite" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const [inviter] = await db
    .select()
    .from(users)
    .where(eq(users.id, invite.createdByUserId))
    .limit(1);

  const inviterName = inviter
    ? displayNameForUser(inviter)
    : "Someone";

  const user = await getOptionalUser();
  if (!user) {
    return (
      <AppShell title="Add friend" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Add {inviterName} as a friend</CardTitle>
            <CardDescription>
              Sign in with Google to connect on Splitwiser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(`/friends/join/${token}`)}`}
              >
                Sign in with Google
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (user.id === invite.createdByUserId) {
    return (
      <AppShell title="Friend invite" backHref="/friends">
        <Card>
          <CardHeader>
            <CardTitle>That&apos;s your invite</CardTitle>
            <CardDescription>
              Share this link with someone else so they can add you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/friends">Back to friends</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (await areFriends(user.id, invite.createdByUserId)) {
    redirect("/friends");
  }

  return (
    <AppShell title="Add friend" backHref="/">
      <Card>
        <CardHeader>
          <CardTitle>Add {inviterName} as a friend</CardTitle>
          <CardDescription>
            You&apos;ll be able to add each other to groups more easily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptFriendInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full" size="lg">
              Accept friend invite
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
