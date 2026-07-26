"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";

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

    return created;
  });

  revalidatePath("/");
  redirect(`/g/${group.id}`);
}
