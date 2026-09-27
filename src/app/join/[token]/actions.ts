"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members } from "@/db/schema";
import { formatActivityMessage } from "@/lib/activity";
import { requireSignedIn } from "@/lib/auth-guards";
import {
  InviteUnavailableError,
  joinGroupWithInvite,
  type JoinChoice,
} from "@/lib/invites";
import { notifyGroupMembers } from "@/lib/push-send";

async function join(token: string, choice: JoinChoice) {
  const user = await requireSignedIn(`/join/${token}`);

  let groupId: string;
  let joined: boolean;
  try {
    ({ groupId, joined } = await joinGroupWithInvite(db, {
      token,
      userId: user.id,
      choice,
    }));
  } catch (error) {
    // The join page explains why the link stopped working.
    if (error instanceof InviteUnavailableError) {
      redirect(`/join/${encodeURIComponent(token)}`);
    }
    throw error;
  }

  if (joined) {
    const [member] = await db
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.userId, user.id)))
      .limit(1);
    if (member) {
      notifyGroupMembers({
        groupId,
        memberIds: "everyone",
        actorMemberId: member.id,
        body: (group) =>
          formatActivityMessage(
            "member_joined",
            { actorName: member.displayName, memberName: member.displayName },
            group.currency,
          ),
        url: `/g/${groupId}/members`,
      });
    }
  }

  revalidatePath("/");
  revalidatePath(`/g/${groupId}/activity`);
  redirect(`/g/${groupId}`);
}

export async function joinAsNewMemberAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    throw new Error("Display name is required");
  }
  await join(token, { kind: "new", displayName });
}

export async function claimPlaceholderAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await join(token, { kind: "claim", memberId });
}
