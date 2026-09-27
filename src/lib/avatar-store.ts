import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { accounts, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  avatarBlobPathname,
  avatarImageApiPath,
  providerPhotoLabel,
  type AvatarImageUpload,
} from "@/lib/avatar";

/** Pathnames are unique per upload, so the Blob CDN can cache for a year. */
const AVATAR_BLOB_CACHE_CONTROL_MAX_AGE = 60 * 60 * 24 * 365;

export type AvatarChange =
  | { kind: "upload"; pathname: string; version: string }
  | { kind: "account" }
  | { kind: "none" };

/**
 * Points the account at its new avatar and returns the uploaded blob it
 * replaced, if any, for the caller to delete.
 */
export async function applyAvatarChange(
  client: Db,
  userId: string,
  change: AvatarChange,
): Promise<{ replacedPathname: string | null }> {
  return client.transaction(async (tx) => {
    const [row] = await tx
      .select({
        accountImage: users.accountImage,
        avatarBlobPathname: users.avatarBlobPathname,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!row) throw new Error("Account not found");

    const next =
      change.kind === "upload"
        ? {
            image: avatarImageApiPath(userId, change.version),
            avatarBlobPathname: change.pathname,
          }
        : {
            image: change.kind === "account" ? row.accountImage : null,
            avatarBlobPathname: null,
          };
    await tx.update(users).set(next).where(eq(users.id, userId));

    const replaced = row.avatarBlobPathname;
    return {
      replacedPathname:
        replaced && replaced !== next.avatarBlobPathname ? replaced : null,
    };
  });
}

async function deleteReplacedAvatar(pathname: string | null) {
  if (!pathname) return;
  try {
    await del(pathname);
  } catch (error) {
    // The account already points elsewhere; an orphaned blob is harmless.
    console.error("Could not delete replaced avatar", error);
  }
}

export async function uploadAvatar(
  client: Db,
  userId: string,
  upload: AvatarImageUpload,
): Promise<void> {
  const version = Date.now().toString(36);
  const pathname = avatarBlobPathname(userId, version, upload.contentType);
  await put(pathname, upload.file, {
    access: "private",
    contentType: upload.contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: AVATAR_BLOB_CACHE_CONTROL_MAX_AGE,
  });
  let replacedPathname: string | null;
  try {
    ({ replacedPathname } = await applyAvatarChange(client, userId, {
      kind: "upload",
      pathname,
      version,
    }));
  } catch (error) {
    await deleteReplacedAvatar(pathname);
    throw error;
  }
  await deleteReplacedAvatar(replacedPathname);
}

export async function setAvatarWithoutUpload(
  client: Db,
  userId: string,
  kind: "account" | "none",
): Promise<void> {
  const { replacedPathname } = await applyAvatarChange(client, userId, {
    kind,
  });
  await deleteReplacedAvatar(replacedPathname);
}

/** The provider photo the account can switch to, with its provider name. */
export async function getAccountPhoto(
  client: Db,
  userId: string,
): Promise<{ image: string; provider: string | null } | null> {
  const [row] = await client
    .select({ accountImage: users.accountImage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.accountImage) return null;
  const linked = await client
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return {
    image: row.accountImage,
    provider: providerPhotoLabel(linked.map((a) => a.provider)),
  };
}
