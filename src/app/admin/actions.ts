"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireSiteAdmin } from "@/lib/auth-guards";
import {
  deleteStalePendingUsers,
  parseMaxUsers,
  revokeInvite,
  setMaxUsers,
} from "@/lib/site-admin";

export async function setMaxUsersAction(value: number) {
  const admin = await requireSiteAdmin();
  const result = await setMaxUsers(db, {
    actor: admin,
    maxUsers: parseMaxUsers(value),
  });
  if (result.changed) {
    console.info("[admin] max_users changed", {
      from: result.from,
      to: result.to,
      actorUserId: admin.id,
    });
  }
  revalidatePath("/admin", "layout");
}

export async function deleteStalePendingUsersAction(): Promise<number> {
  const admin = await requireSiteAdmin();
  const ids = await deleteStalePendingUsers(db, { actor: admin });
  if (ids.length > 0) {
    console.info("[admin] stale pending signups deleted", {
      count: ids.length,
      actorUserId: admin.id,
    });
  }
  revalidatePath("/admin", "layout");
  return ids.length;
}

export async function revokeInviteAction(inviteId: string) {
  const admin = await requireSiteAdmin();
  const revoked = await revokeInvite(db, { actor: admin, inviteId });
  if (revoked) {
    console.info("[admin] invitation revoked", {
      inviteId,
      actorUserId: admin.id,
    });
  }
  revalidatePath("/admin", "layout");
}
