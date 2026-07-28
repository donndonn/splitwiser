import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { updateProfileNameAction } from "./actions";

export default async function ProfilePage() {
  const sessionUser = await requireUser("/profile");
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  const name = dbUser ? displayNameForUser(dbUser) : displayNameForUser(sessionUser);
  const email = dbUser?.email ?? sessionUser.email;
  const image = dbUser?.image ?? sessionUser.image;

  return (
    <AppShell title="Profile" backHref="/">
      <div className="mb-6 flex items-center gap-3">
        <Avatar className="size-14">
          <AvatarImage src={image ?? undefined} alt="" />
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      <form action={updateProfileNameAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={dbUser?.name?.trim() || name}
            maxLength={50}
            required
          />
          <p className="text-xs text-muted-foreground">
            Shown to friends and used as your default name when added to a
            group. Per-group nicknames stay separate.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email ?? ""} disabled readOnly />
        </div>
        <Button type="submit" className="w-full" size="lg">
          Save
        </Button>
      </form>
    </AppShell>
  );
}
