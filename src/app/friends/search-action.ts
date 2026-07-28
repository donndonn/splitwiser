"use server";

import { requireUser } from "@/lib/auth-guards";
import { findUserByEmailOrUsername, type SearchHit } from "@/lib/friends";

export async function searchFriendsAction(
  query: string,
): Promise<SearchHit | null> {
  const user = await requireUser("/friends");
  return findUserByEmailOrUsername(query, user.id);
}
