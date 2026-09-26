"use server";

import { requireUser } from "@/lib/auth-guards";
import { findUserBySearchQuery, type SearchHit } from "@/lib/friends";

export async function searchFriendsAction(
  query: string,
): Promise<SearchHit | null> {
  const user = await requireUser("/friends");
  return findUserBySearchQuery(query, user.id);
}
