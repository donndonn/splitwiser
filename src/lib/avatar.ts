export const AVATAR_IMAGE_FIELD = "avatarImage";

/** Join form checkbox: keep the sign-in provider's photo (on by default). */
export const USE_ACCOUNT_PHOTO_FIELD = "useAccountPhoto";

/** Sent alongside the checkbox, since an unchecked box sends nothing. */
export const USE_ACCOUNT_PHOTO_CHOICE_FIELD = "accountPhotoChoice";

/** Uploads are resized in the browser first, so this only stops abuse. */
export const MAX_AVATAR_IMAGE_BYTES = 1_000_000;

export const AVATAR_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarImageMimeType = (typeof AVATAR_IMAGE_MIME_TYPES)[number];

export function isAvatarImageMimeType(
  value: string,
): value is AvatarImageMimeType {
  return (AVATAR_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

function extensionForContentType(contentType: AvatarImageMimeType): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
  }
}

/** Each upload gets a new pathname, so cached copies never go stale. */
export function avatarBlobPathname(
  userId: string,
  version: string,
  contentType: AvatarImageMimeType,
): string {
  return `avatars/${userId}/${version}.${extensionForContentType(contentType)}`;
}

/** The `users.image` value for an uploaded avatar. */
export function avatarImageApiPath(userId: string, version: string): string {
  return `/api/avatars/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`;
}

export type AvatarImageUpload = {
  file: File;
  contentType: AvatarImageMimeType;
};

export function readAvatarImageFromFormData(
  formData: FormData,
): AvatarImageUpload {
  const value = formData.get(AVATAR_IMAGE_FIELD);
  if (!(value instanceof Blob) || value.size === 0) {
    throw new Error("Choose a photo to upload.");
  }
  if (value.size > MAX_AVATAR_IMAGE_BYTES) {
    throw new Error("That photo is too large. Try another one.");
  }
  const contentType = (value.type || "image/jpeg").toLowerCase();
  if (!isAvatarImageMimeType(contentType)) {
    throw new Error("Use a JPEG, PNG, or WebP photo.");
  }
  const file =
    value instanceof File
      ? value
      : new File([value], `avatar.${extensionForContentType(contentType)}`, {
          type: contentType,
        });
  return { file, contentType };
}

/** "Google" or "Apple" for the choice copy; null when neither is linked. */
export function providerPhotoLabel(providers: string[]): string | null {
  if (providers.includes("google")) return "Google";
  if (providers.includes("apple")) return "Apple";
  return null;
}
