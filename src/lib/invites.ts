import { and, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { groups, invites, members, users, type Invite } from "@/db/schema";
import type { Db } from "@/db/types";
import { logGroupActivity } from "@/lib/activity";

/** Every new invitation link lasts 30 days or 15 joins, whichever is first. */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_MAX_USES = 15;

export type InviteStatus = "live" | "expired" | "used_up" | "revoked";

export function inviteStatus(
  invite: Pick<Invite, "revokedAt" | "expiresAt" | "maxUses" | "uses">,
  now: Date = new Date(),
): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  if (invite.maxUses != null && invite.uses >= invite.maxUses) {
    return "used_up";
  }
  return "live";
}

export function inviteUnavailableMessage(status: InviteStatus): string {
  switch (status) {
    case "expired":
      return "This invite has expired.";
    case "used_up":
      return "This invite has reached its join limit.";
    case "revoked":
      return "This invite is no longer active.";
    case "live":
      return "";
  }
}

export type InviteLinkChange = "create" | "reset" | "disable";

/**
 * Create, reset, or disable a group's current invitation link.
 *
 * Serialized on the group row. The previous invitation is revoked before its
 * replacement is inserted, so at most one non-revoked row exists per group.
 * "create" reuses a live link instead of replacing it.
 */
export async function changeGroupInviteLink(
  client: Db,
  input: {
    groupId: string;
    actorMemberId: string;
    change: InviteLinkChange;
    now?: Date;
  },
): Promise<{ token: string | null; replaced: boolean }> {
  const now = input.now ?? new Date();

  return client.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) throw new Error("Group not found");

    // Locks the current invitation so an in-flight join finishes (or sees
    // the revocation) before the replacement commits.
    const [current] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.groupId, input.groupId), isNull(invites.revokedAt)))
      .limit(1)
      .for("update");

    if (
      input.change === "create" &&
      current &&
      inviteStatus(current, now) === "live"
    ) {
      return { token: current.token, replaced: false };
    }

    if (current) {
      await tx
        .update(invites)
        .set({ revokedAt: now })
        .where(eq(invites.id, current.id));
    }

    if (input.change === "disable") {
      return { token: null, replaced: current != null };
    }

    const token = nanoid(24);
    await tx.insert(invites).values({
      groupId: input.groupId,
      token,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      maxUses: INVITE_MAX_USES,
      createdByMemberId: input.actorMemberId,
      createdAt: now,
    });
    return { token, replaced: current != null };
  });
}

export class InviteUnavailableError extends Error {
  constructor(message = "This invite is no longer valid") {
    super(message);
    this.name = "InviteUnavailableError";
  }
}

export type JoinChoice =
  | { kind: "new"; displayName: string }
  | { kind: "claim"; memberId: string };

/**
 * Join a group through an invitation link and complete onboarding.
 *
 * Existing members return their group without consuming a join, even on an
 * old link. Otherwise the invitation must be live; one join is consumed for
 * each new or claimed membership.
 */
export async function joinGroupWithInvite(
  client: Db,
  input: { token: string; userId: string; choice: JoinChoice; now?: Date },
): Promise<{ groupId: string; joined: boolean }> {
  const now = input.now ?? new Date();

  return client.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.token, input.token))
      .limit(1)
      .for("update");

    if (!invite) throw new InviteUnavailableError();

    // Permanent: later leaving or removal never revokes app access.
    const markOnboarded = () =>
      tx
        .update(users)
        .set({ onboardingCompletedAt: now })
        .where(
          and(eq(users.id, input.userId), isNull(users.onboardingCompletedAt)),
        );

    const [existing] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.groupId, invite.groupId),
          eq(members.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing) {
      await markOnboarded();
      return { groupId: invite.groupId, joined: false };
    }

    const status = inviteStatus(invite, now);
    if (status !== "live") {
      throw new InviteUnavailableError(inviteUnavailableMessage(status));
    }

    let memberId: string;
    let memberName: string;

    if (input.choice.kind === "new") {
      const displayName = input.choice.displayName.trim();
      if (!displayName) throw new Error("Display name is required");
      const [created] = await tx
        .insert(members)
        .values({
          groupId: invite.groupId,
          userId: input.userId,
          displayName,
          isAdmin: false,
        })
        .returning({ id: members.id });
      memberId = created.id;
      memberName = displayName;
    } else {
      const [placeholder] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.id, input.choice.memberId),
            eq(members.groupId, invite.groupId),
            isNull(members.userId),
          ),
        )
        .limit(1)
        .for("update");

      if (!placeholder) {
        throw new Error("That placeholder is no longer available");
      }

      await tx
        .update(members)
        .set({ userId: input.userId })
        .where(eq(members.id, placeholder.id));
      memberId = placeholder.id;
      memberName = placeholder.displayName;
    }

    await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(eq(invites.id, invite.id));

    await markOnboarded();

    await logGroupActivity(tx, {
      groupId: invite.groupId,
      type: "member_joined",
      actorMemberId: memberId,
      payload: { actorName: memberName, memberName },
    });

    return { groupId: invite.groupId, joined: true };
  });
}
