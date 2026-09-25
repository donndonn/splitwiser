"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireSignedIn } from "@/lib/auth-guards";
import {
  InviteUnavailableError,
  joinGroupWithInvite,
  type JoinChoice,
} from "@/lib/invites";

async function join(token: string, choice: JoinChoice) {
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
