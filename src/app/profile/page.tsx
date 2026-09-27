import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { InstallCoach } from "@/components/install-coach";
import { PushToggle } from "@/components/push-toggle";
import { SettingsSection } from "@/components/settings-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeSelector } from "@/components/theme-selector";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guards";
import { displayNameForUser } from "@/lib/friends";
import { getVapidPublicKey } from "@/lib/push-send";
import { isTwilioVerifyConfigured } from "@/lib/twilio-verify";
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
  const phone = dbUser?.phone ?? null;
  const smsEnabled = isTwilioVerifyConfigured();
  const vapidPublicKey = getVapidPublicKey();

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
          <p className="min-w-0 truncate text-lg font-semibold">{name}</p>
        </div>

        <ProfileForm
          name={dbUser?.name?.trim() || name}
          username={username}
          email={email}
          venmoUsername={dbUser?.venmoUsername ?? null}
          phone={phone}
          smsEnabled={smsEnabled}
        />

        <SettingsSection id="preferences-heading" title="Preferences">
          <ThemeSelector />
          {vapidPublicKey ? <PushToggle vapidPublicKey={vapidPublicKey} /> : null}
          <InstallCoach venue="profile" />
        </SettingsSection>
      </AppShell>
      <AppBottomNav />
    </>
  );
}
