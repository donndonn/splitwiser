"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { groups, members, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { displayNameForUser, listFriends } from "@/lib/friends";

export async function createGroupAction(formData: FormData) {
  const user = await requireUser("/new");

  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const displayName =
    String(formData.get("displayName") ?? "").trim() ||
    user.name?.trim() ||
    user.email?.split("@")[0] ||
    "Me";

  if (!name) {
    throw new Error("Group name is required");
  }

  const selectedFriendIds = formData
    .getAll("friendIds")
    .map((v) => String(v))
    .filter(Boolean);

  const friends = await listFriends(user.id);
  const friendById = new Map(friends.map((f) => [f.id, f]));
  const validFriendIds = selectedFriendIds.filter((id) => friendById.has(id));

  const friendUsers =
    validFriendIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, validFriendIds))
      : [];

  const group = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(groups)
      .values({ name, currency: currency.toUpperCase() })
      .returning();

    await tx.insert(members).values({
      groupId: created.id,
      userId: user.id,
      displayName,
      isAdmin: true,
    });

    for (const friend of friendUsers) {
      await tx.insert(members).values({
        groupId: created.id,
        userId: friend.id,
        displayName: displayNameForUser(friend),
        isAdmin: false,
      });
    }

    return created;
  });

  revalidatePath("/");
  redirect(`/g/${group.id}`);
}
