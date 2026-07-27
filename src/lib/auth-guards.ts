import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { members, type Member } from "@/db/schema";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
});

export async function requireUser(
  callbackUrl?: string,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const params = callbackUrl
      ? `?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "";
    redirect(`/signin${params}`);
  }
  return user;
}

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
