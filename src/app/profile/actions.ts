"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { validateUsername } from "@/lib/friends";

const MAX_NAME_LENGTH = 50;

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser("/profile");
  const name = String(formData.get("name") ?? "").trim();
  const usernameRaw = String(formData.get("username") ?? "");

  if (!name) {
    throw new Error("Display name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Display name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  const username = validateUsername(usernameRaw);

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(${users.username}) = ${username}`,
        ne(users.id, user.id),
      ),
    )
    .limit(1);

  if (taken) {
    throw new Error("That username is already taken");
  }

  await db
    .update(users)
    .set({ name, username })
    .where(eq(users.id, user.id));

  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/friends");
}
