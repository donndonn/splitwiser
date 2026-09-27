import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";
import { applyAvatarChange, getAccountPhoto } from "./avatar-store";

const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/photo";

describe.skipIf(!hasTestDatabase)("avatar changes", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.sql`truncate users cascade`;
    await t.sql`
      insert into users (id, email, image, account_image) values
        ('a', 'a@example.test', ${GOOGLE_PHOTO}, ${GOOGLE_PHOTO})
    `;
    await t.sql`
      insert into accounts ("userId", type, provider, "providerAccountId")
      values ('a', 'oidc', 'google', 'g-a')
    `;
  });

  async function avatarOf(id: string) {
    const [row] = await t.sql<
      { image: string | null; avatar_blob_pathname: string | null }[]
    >`select image, avatar_blob_pathname from users where id = ${id}`;
    return row;
  }

  it("points the account at an upload, then reports it when replaced", async () => {
    expect(
      await applyAvatarChange(t.db, "a", {
        kind: "upload",
        pathname: "avatars/a/v1.jpg",
        version: "v1",
      }),
    ).toEqual({ replacedPathname: null });
    expect(await avatarOf("a")).toEqual({
      image: "/api/avatars/a?v=v1",
      avatar_blob_pathname: "avatars/a/v1.jpg",
    });

    expect(
      await applyAvatarChange(t.db, "a", {
        kind: "upload",
        pathname: "avatars/a/v2.jpg",
        version: "v2",
      }),
    ).toEqual({ replacedPathname: "avatars/a/v1.jpg" });
  });

  it("switches back to the provider photo", async () => {
    await applyAvatarChange(t.db, "a", {
      kind: "upload",
      pathname: "avatars/a/v1.jpg",
      version: "v1",
    });
    expect(await applyAvatarChange(t.db, "a", { kind: "account" })).toEqual({
      replacedPathname: "avatars/a/v1.jpg",
    });
    expect(await avatarOf("a")).toEqual({
      image: GOOGLE_PHOTO,
      avatar_blob_pathname: null,
    });
  });

  it("removes the photo but keeps the provider photo to return to", async () => {
    await applyAvatarChange(t.db, "a", { kind: "none" });
    expect(await avatarOf("a")).toEqual({
      image: null,
      avatar_blob_pathname: null,
    });
    expect(await getAccountPhoto(t.db, "a")).toEqual({
      image: GOOGLE_PHOTO,
      provider: "Google",
    });
  });
});
