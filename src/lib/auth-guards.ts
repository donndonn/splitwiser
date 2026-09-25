import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, users, type Member } from "@/db/schema";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** False until the account joins its first group. */
  onboarded: boolean;
  signupInviteId: string | null;
};

/**
 * Reads the account from the database on every request, so onboarding status
 * (and deleted accounts) never depend on a stale session token.
 */
const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      onboardingCompletedAt: users.onboardingCompletedAt,
      signupInviteId: users.signupInviteId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    onboarded: row.onboardingCompletedAt != null,
    signupInviteId: row.signupInviteId,
  };
});

function redirectToSignIn(callbackUrl?: string): never {
  const params = callbackUrl
    ? `?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "";
  redirect(`/signin${params}`);
}

/**
 * Any signed-in account, including unfinished signups. Only for invitation
 * and onboarding pages; everything else uses requireUser.
 */
export async function requireSignedIn(
  callbackUrl?: string,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirectToSignIn(callbackUrl);
  return user;
}

/** A signed-in account that has completed onboarding. */
export async function requireUser(
  callbackUrl?: string,
): Promise<SessionUser> {
  const user = await requireSignedIn(callbackUrl);
  if (!user.onboarded) redirect("/onboarding");
  return user;
}

/** The signed-in account, if any. Callers must check `onboarded`. */
export async function getOptionalUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export const getMembership = cache(
  async (groupId: string, userId: string): Promise<Member | null> => {
    const [member] = await db
      .select()
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.userId, userId)))
      .limit(1);
    return member ?? null;
  },
);

export async function requireMember(groupId: string): Promise<{
  user: SessionUser;
  member: Member;
}> {
  const user = await requireUser(`/g/${groupId}`);
  const member = await getMembership(groupId, user.id);
  if (!member) {
    notFound();
  }
  return { user, member };
}

export async function requireAdmin(groupId: string): Promise<{
  user: SessionUser;
  member: Member;
}> {
  const result = await requireMember(groupId);
  if (!result.member.isAdmin) {
    notFound();
  }
  return result;
}
