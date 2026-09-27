"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireSignedIn } from "@/lib/auth-guards";
import {
  USE_ACCOUNT_PHOTO_CHOICE_FIELD,
  USE_ACCOUNT_PHOTO_FIELD,
} from "@/lib/avatar";
import { setAvatarWithoutUpload } from "@/lib/avatar-store";
import {
  InviteUnavailableError,
  joinGroupWithInvite,
  type JoinChoice,
} from "@/lib/invites";

async function join(
  token: string,
  choice: JoinChoice,
  useAccountPhoto: boolean,
) {
  const user = await requireSignedIn(`/join/${token}`);

  let groupId: string;
  try {
    ({ groupId } = await joinGroupWithInvite(db, {
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

  // New accounts start with their provider photo unless they opted out.
  if (!user.onboarded && !useAccountPhoto) {
    await setAvatarWithoutUpload(db, user.id, "none");
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

export async function claimPlaceholderAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await join(token, { kind: "claim", memberId }, readUseAccountPhoto(formData));
}
