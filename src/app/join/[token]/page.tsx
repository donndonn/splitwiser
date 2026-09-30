import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SignInProviders } from "@/components/sign-in-providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { groups, invites, members } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import { getAccountPhoto } from "@/lib/avatar-store";
import {
  countInviteReservations,
  inviteStatus,
  inviteUnavailableMessage,
} from "@/lib/invites";
import { getSharedGroupView } from "@/lib/share-link";
import { isVerifyAuthEnabled } from "@/lib/verify-auth";
import { SharedGroupContent } from "@/app/s/[token]/shared-group-content";
import {
  claimPlaceholderAction,
  joinAsNewMemberAction,
} from "./actions";
import { JoinMembershipForms } from "./join-forms";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const [invite] = await db
    .select({
      id: invites.id,
      token: invites.token,
      groupId: invites.groupId,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      uses: invites.uses,
      revokedAt: invites.revokedAt,
      groupName: groups.name,
    })
    .from(invites)
    .innerJoin(groups, eq(invites.groupId, groups.id))
    .where(eq(invites.token, token))
    .limit(1);

  if (!invite) {
    return (
      <AppShell title="Invite" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This link is invalid. Ask the group admin for a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const user = await getOptionalUser();

  // Members reach their group from any of its links, old or new, without
  // consuming a join.
  if (user) {
    const [existing] = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.groupId, invite.groupId), eq(members.userId, user.id)),
      )
      .limit(1);
    if (existing) {
      redirect(`/g/${invite.groupId}`);
    }
  }

  const status = inviteStatus(
    invite,
    new Date(),
    await countInviteReservations(db, invite.id, user?.id),
  );
  // A full link still lets people sign in: a pending account holding one of
  // its reservations resumes its join, and new accounts are rejected at
  // admission.
  const fullForNewAccounts = !user && status === "used_up";
  if (status !== "live" && !fullForNewAccounts) {
    return (
      <AppShell title="Invite" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>
              {inviteUnavailableMessage(status)} Ask a group admin for a new
              link.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (!user) {
    // A join link also shows the group, so friends can look before signing
    // up. Null once the link has expired.
    const view = await getSharedGroupView(db, token);
    return (
      <AppShell title="Join group" backHref="/">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Join {invite.groupName}</CardTitle>
            <CardDescription>
              {fullForNewAccounts
                ? "This link has reached its join limit for new accounts. If you already signed up with it, sign in to finish joining."
                : "Sign in with Google or Apple to join this group. New to Splitwiser? This link creates your account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SignInProviders redirectTo={`/join/${token}`} inviteToken={token} />
            {isVerifyAuthEnabled() ? (
              <Button asChild variant="ghost" className="w-full">
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
                >
                  Verification sign-in
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
        {view ? (
          <SharedGroupContent view={view} token={token} viewerId={null} />
        ) : null}
      </AppShell>
    );
  }

  const placeholders = await db
    .select()
    .from(members)
    .where(
      and(eq(members.groupId, invite.groupId), isNull(members.userId)),
    );

  const defaultName =
    user.name?.trim() || user.email?.split("@")[0] || "Me";
  const hasPlaceholders = placeholders.length > 0;
  // Only new accounts choose here; members change their photo in Profile.
  const accountPhoto =
    !user.onboarded && user.image ? await getAccountPhoto(db, user.id) : null;
  const placeholderNotice =
    error === "placeholder"
      ? "That name isn't available anymore. Choose another, or join with a new name."
      : null;

  return (
    <AppShell title="Join group" backHref="/">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{invite.groupName}</h2>
          <p className="text-sm text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-medium">Who are you joining as?</h3>
          {hasPlaceholders && (
            <p className="text-sm text-muted-foreground">
              Pick your name if you&apos;re already on the list — that keeps
              expenses logged under it. Or join with a new name below.
            </p>
          )}
        </div>

        {placeholderNotice ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {placeholderNotice}
          </p>
        ) : null}

        <JoinMembershipForms
          token={token}
          placeholders={placeholders.map((placeholder) => ({
            id: placeholder.id,
            displayName: placeholder.displayName,
          }))}
          defaultName={defaultName}
          accountPhoto={accountPhoto}
          claimPlaceholderAction={claimPlaceholderAction}
          joinAsNewMemberAction={joinAsNewMemberAction}
        />
      </div>
    </AppShell>
  );
}
