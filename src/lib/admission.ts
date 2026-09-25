import { eq, sql } from "drizzle-orm";
import { appSettings, invites, users, type User } from "@/db/schema";
import type { Db } from "@/db/types";
import { inviteStatus } from "@/lib/invites";

export const ADMISSION_FAILURES = [
  "invite_required",
  "invite_unavailable",
  "full",
  "closed",
] as const;

export type AdmissionFailure = (typeof ADMISSION_FAILURES)[number];

export function isAdmissionFailure(value: unknown): value is AdmissionFailure {
  return ADMISSION_FAILURES.includes(value as AdmissionFailure);
}

export class AdmissionError extends Error {
  constructor(readonly reason: AdmissionFailure) {
    super(`New account rejected: ${reason}`);
    this.name = "AdmissionError";
  }
}

export type NewUserProfile = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
};

/**
 * Create a new account admitted by a group invitation, within the global
 * account cap.
 *
 * The settings row lock serializes competing registrations across app
 * instances, so the count check cannot be raced. Existing-account lookup and
 * provider linking happen before Auth.js calls this, so they never consume a
 * slot. The invitation is only checked here; joins are consumed on joining.
 */
export async function admitNewUser(
  client: Db,
  input: { inviteId: string | null; profile: NewUserProfile; now?: Date },
): Promise<User> {
  if (!input.inviteId) throw new AdmissionError("invite_required");
  const inviteId = input.inviteId;
  const now = input.now ?? new Date();

  return client.transaction(async (tx) => {
    const [settings] = await tx
      .select({ maxUsers: appSettings.maxUsers })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1)
      .for("update");
    if (!settings) throw new AdmissionError("closed");

    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, inviteId))
      .limit(1)
      .for("update");
    if (!invite || inviteStatus(invite, now) !== "live") {
      throw new AdmissionError("invite_unavailable");
    }

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    if (count >= settings.maxUsers) throw new AdmissionError("full");

    const [created] = await tx
      .insert(users)
      .values({
        name: input.profile.name ?? null,
        email: input.profile.email ?? null,
        image: input.profile.image ?? null,
        emailVerified: input.profile.emailVerified ?? null,
        onboardingCompletedAt: null,
        signupInviteId: invite.id,
      })
      .returning();
    return created;
  });
}
