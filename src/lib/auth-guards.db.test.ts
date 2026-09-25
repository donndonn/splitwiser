import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  hasTestDatabase,
  type TestDatabase,
} from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: null as unknown,
  sessionUserId: null as string | null,
}));

vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));

vi.mock("@/auth", () => ({
  auth: async () =>
    state.sessionUserId ? { user: { id: state.sessionUserId } } : null,
}));

const guards = await import("./auth-guards");
const friends = await import("./friends");

function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: string })?.digest;
  if (!digest?.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2] ?? null;
}

async function expectRedirect(promise: Promise<unknown>, target: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(redirectTarget(error)).toBe(target);
}

describe.skipIf(!hasTestDatabase)("onboarding guards", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.migrate();
    state.db = t.db;
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.sql`truncate users, groups cascade`;
    await t.sql`
      insert into users (id, email, username, onboarding_completed_at) values
        ('done', 'done@example.test', 'done_user', now()),
        ('pending', 'pending@example.test', 'pending_user', null)
    `;
    await t.sql`insert into groups (id, name) values ('g1', 'Trip')`;
    await t.sql`
      insert into members (id, group_id, user_id, display_name, is_admin) values
        ('m-done', 'g1', 'done', 'Done', true)
    `;
  });

  it("sends signed-out users to sign in", async () => {
    state.sessionUserId = null;
    await expectRedirect(guards.requireUser("/friends"), "/signin?callbackUrl=%2Ffriends");
  });

  it("sends pending accounts to onboarding from normal guards", async () => {
    state.sessionUserId = "pending";
    await expectRedirect(guards.requireUser("/new"), "/onboarding");
    await expectRedirect(guards.requireMember("g1"), "/onboarding");
    await expectRedirect(guards.requireAdmin("g1"), "/onboarding");
  });

  it("lets pending accounts reach invitation and onboarding pages", async () => {
    state.sessionUserId = "pending";
    await expect(guards.requireSignedIn()).resolves.toMatchObject({
      id: "pending",
      onboarded: false,
    });
    await expect(guards.getOptionalUser()).resolves.toMatchObject({
      onboarded: false,
    });
  });

  it("reads onboarding from the database, not the session", async () => {
    state.sessionUserId = "pending";
    await t.sql`update users set onboarding_completed_at = now() where id = 'pending'`;
    await expect(guards.requireUser()).resolves.toMatchObject({
      onboarded: true,
    });
  });

  it("treats a deleted account as signed out", async () => {
    state.sessionUserId = "gone";
    await expect(guards.getOptionalUser()).resolves.toBeNull();
  });

  it("allows onboarded members", async () => {
    state.sessionUserId = "done";
    await expect(guards.requireAdmin("g1")).resolves.toMatchObject({
      member: { id: "m-done" },
    });
  });

  it("hides pending accounts from friend discovery and additions", async () => {
    expect(
      await friends.findUserByEmailOrUsername("pending@example.test", "done"),
    ).toBeNull();
    expect(await friends.findUserByEmailOrUsername("@pending_user", "done")).toBeNull();
    expect(
      await friends.findUserByEmailOrUsername("@done_user", "pending"),
    ).toMatchObject({ id: "done" });
    expect(await friends.isOnboardedUser("pending")).toBe(false);
    expect(await friends.isOnboardedUser("done")).toBe(true);

    await t.sql`
      insert into friendships (id, user_id_a, user_id_b) values ('f1', 'done', 'pending')
    `;
    expect(await friends.listFriends("done")).toEqual([]);
  });
});
