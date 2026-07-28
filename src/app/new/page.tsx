import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { displayNameForUser, listFriends } from "@/lib/friends";
import { createGroupAction } from "./actions";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "JPY", "TWD", "HKD"];

export default async function NewGroupPage() {
  const sessionUser = await requireUser("/new");
  const [[dbUser], friends] = await Promise.all([
    db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1),
    listFriends(sessionUser.id),
  ]);

  const defaultName = dbUser
    ? displayNameForUser(dbUser)
    : sessionUser.name?.trim() ||
      sessionUser.email?.split("@")[0] ||
      "Me";

  return (
    <AppShell title="New group" backHref="/">
      <form action={createGroupAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Group name</Label>
          <Input
            id="name"
            name="name"
            placeholder="Weekend trip"
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Your name in this group</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={defaultName}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <NativeSelect id="currency" name="currency" defaultValue="USD">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Also add friends</Label>
            <p className="text-xs text-muted-foreground">
              They&apos;ll join as linked members immediately.
            </p>
          </div>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends yet.{" "}
              <Link href="/friends" className="underline underline-offset-2">
                Invite friends first
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2 rounded-xl border p-3">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name="friendIds"
                      value={friend.id}
                      className="size-4 rounded border-input"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {friend.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {friend.email}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg">
          Create group
        </Button>
      </form>
    </AppShell>
  );
}
