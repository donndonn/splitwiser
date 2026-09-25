"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { countInviteReservations, inviteStatus } from "@/lib/invites";
import {
  SIGNUP_INVITE_COOKIE,
  encodeSignupInvite,
  signupInviteCookieOptions,
} from "@/lib/signup-invite-cookie";

const PROVIDERS = new Set(["google", "apple"]);

/**
 * Shared entry point for signing in from an invitation page. Validates the
 * invitation and carries its id through OAuth in a signed cookie; account
 * creation revalidates it. Existing accounts sign in normally.
 */
export async function startInviteSignInAction(
  token: string,
  provider: string,
) {
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported provider");
  const joinPath = `/join/${encodeURIComponent(token)}`;

  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1);
  const secret = process.env.AUTH_SECRET;
  const live =
    invite &&
    inviteStatus(
      invite,
      new Date(),
      await countInviteReservations(db, invite.id),
    ) === "live";
  if (!invite || !live || !secret) {
    redirect(joinPath);
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SIGNUP_INVITE_COOKIE,
    encodeSignupInvite(invite.id, secret),
    signupInviteCookieOptions(),
  );
  await signIn(provider, { redirectTo: joinPath });
}
