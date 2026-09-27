import { describe, expect, it } from "vitest";
import {
  AVATAR_IMAGE_FIELD,
  MAX_AVATAR_IMAGE_BYTES,
  avatarBlobPathname,
  avatarImageApiPath,
  providerPhotoLabel,
  readAvatarImageFromFormData,
} from "@/lib/avatar";

function formWith(value: Blob | string | null) {
  const formData = new FormData();
  if (value != null) formData.set(AVATAR_IMAGE_FIELD, value);
  return formData;
}

describe("avatar paths", () => {
  it("stores each upload under its own versioned pathname", () => {
    expect(avatarBlobPathname("u1", "abc", "image/jpeg")).toBe(
      "avatars/u1/abc.jpg",
    );
    expect(avatarBlobPathname("u1", "abc", "image/webp")).toBe(
      "avatars/u1/abc.webp",
    );
  });

  it("serves uploads from the auth'd avatar route", () => {
    expect(avatarImageApiPath("u1", "abc")).toBe("/api/avatars/u1?v=abc");
  });
});

describe("readAvatarImageFromFormData", () => {
  it("accepts a JPEG", () => {
    const upload = readAvatarImageFromFormData(
      formWith(new File(["x"], "a.jpg", { type: "image/jpeg" })),
    );
    expect(upload.contentType).toBe("image/jpeg");
  });

  it("rejects a missing or empty file", () => {
    expect(() => readAvatarImageFromFormData(formWith(null))).toThrow(
      "Choose a photo",
    );
    expect(() =>
      readAvatarImageFromFormData(formWith(new Blob([], { type: "image/png" }))),
    ).toThrow("Choose a photo");
  });

  it("rejects other types and oversized files", () => {
    expect(() =>
      readAvatarImageFromFormData(
        formWith(new Blob(["<svg/>"], { type: "image/svg+xml" })),
      ),
    ).toThrow("JPEG, PNG, or WebP");
    expect(() =>
      readAvatarImageFromFormData(
        formWith(
          new Blob([new Uint8Array(MAX_AVATAR_IMAGE_BYTES + 1)], {
            type: "image/jpeg",
          }),
        ),
      ),
    ).toThrow("too large");
  });
});

describe("providerPhotoLabel", () => {
  it("names the linked provider, preferring Google", () => {
    expect(providerPhotoLabel(["apple", "google"])).toBe("Google");
    expect(providerPhotoLabel(["apple"])).toBe("Apple");
    expect(providerPhotoLabel(["credentials"])).toBeNull();
  });
});
