import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { groups, invites, members } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import {
  claimPlaceholderAction,
  joinAsNewMemberAction,
} from "./actions";

function inviteStatus(invite: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
}) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return "expired" as const;
  }
  if (invite.maxUses != null && invite.uses >= invite.maxUses) {
    return "used_up" as const;
  }
  return "live" as const;
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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

  const status = inviteStatus(invite);
  if (status !== "live") {
    const message =
      status === "expired"
        ? "This invite has expired."
        : status === "used_up"
          ? "This invite has reached its use limit."
          : "This invite was revoked.";
    return (
      <AppShell title="Invite" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const user = await getOptionalUser();
  if (!user) {
    return (
      <AppShell title="Join group" backHref="/">
        <Card>
          <CardHeader>
            <CardTitle>Join {invite.groupName}</CardTitle>
            <CardDescription>
              Sign in with Google to join this group.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
              >
                Sign in with Google
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const [existing] = await db
    .select()
    .from(members)
    .where(
      and(eq(members.groupId, invite.groupId), eq(members.userId, user.id)),
    )
    .limit(1);

  if (existing) {
    redirect(`/g/${invite.groupId}`);
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

        {hasPlaceholders && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Already on the list?</p>
            <ul className="space-y-2">
              {placeholders.map((p) => (
                <li key={p.id}>
                  <form action={claimPlaceholderAction}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="memberId" value={p.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full justify-between"
                      size="lg"
                    >
                      <span>{p.displayName}</span>
                      <span className="text-muted-foreground">Join as</span>
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={joinAsNewMemberAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="displayName">
              {hasPlaceholders ? "Or join as" : "Join as"}
            </Label>
            <Input
              id="displayName"
              name="displayName"
              placeholder="Your name"
              defaultValue={hasPlaceholders ? undefined : defaultName}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            variant={hasPlaceholders ? "secondary" : "default"}
            size="lg"
          >
            Join group
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
