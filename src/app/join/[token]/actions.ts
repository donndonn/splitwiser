"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireSignedIn } from "@/lib/auth-guards";
import {
  USE_ACCOUNT_PHOTO_CHOICE_FIELD,
  USE_ACCOUNT_PHOTO_FIELD,
} from "@/lib/avatar";
import { setAvatarWithoutUpload } from "@/lib/avatar-store";
import {
  joinFailurePath,
  joinGroupWithInvite,
  type JoinChoice,
} from "@/lib/invites";
import { activityPushBody } from "@/lib/push";
import { notifyGroupMembers } from "@/lib/push-send";

async function join(
  token: string,
  choice: JoinChoice,
  useAccountPhoto: boolean,
) {
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
    // Expected failures return to the invite as a GET. A thrown error would
    // be a 500, and an in-app browser reloads that by resubmitting the POST.
    const failurePath = joinFailurePath(token, error);
    if (failurePath) redirect(failurePath);
    throw error;
  }

  // New accounts start with their provider photo unless they opted out.
  if (!user.onboarded && !useAccountPhoto) {
    await setAvatarWithoutUpload(db, user.id, "none");
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
          activityPushBody(
            member.displayName,
            { kind: "member_joined", memberName: member.displayName },
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

function readUseAccountPhoto(formData: FormData): boolean {
  // Absent when the join page showed no photo choice, so keep the photo.
  if (!formData.has(USE_ACCOUNT_PHOTO_CHOICE_FIELD)) return true;
  return formData.get(USE_ACCOUNT_PHOTO_FIELD) === "on";
}

export async function joinAsNewMemberAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    throw new Error("Display name is required");
  }
  await join(token, { kind: "new", displayName }, readUseAccountPhoto(formData));
}

export async function claimPlaceholderAction(
  memberId: string,
  formData: FormData,
) {
  const token = String(formData.get("token") ?? "");
  await join(token, { kind: "claim", memberId }, readUseAccountPhoto(formData));
}
