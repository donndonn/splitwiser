import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const sessionUser = await requireUser("/profile");
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  const name = dbUser
    ? displayNameForUser(dbUser)
    : displayNameForUser(sessionUser);
  const email = dbUser?.email ?? sessionUser.email ?? null;
  const image = dbUser?.image ?? sessionUser.image ?? null;
  const username = dbUser?.username ?? null;

  return (
    <>
      <AppShell
        title="Profile"
        withBottomNav
        actions={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        }
      >
        <div className="mb-6 flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarImage src={image ?? undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            {username ? (
              <p className="truncate text-sm text-muted-foreground">
                <span className="text-muted-foreground/80">@</span>
                {username}
              </p>
            ) : null}
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        <ProfileForm
          name={dbUser?.name?.trim() || name}
          username={username}
          email={email}
        />
      </AppShell>
      <AppBottomNav />
    </>
  );
}
