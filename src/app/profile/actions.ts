"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";

const MAX_NAME_LENGTH = 50;

export async function updateProfileNameAction(formData: FormData) {
  const user = await requireUser("/profile");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    throw new Error("Display name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Display name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  await db.update(users).set({ name }).where(eq(users.id, user.id));

  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/friends");
}
