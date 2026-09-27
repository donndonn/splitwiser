import { ActivityFeed } from "@/components/activity-feed";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppShell } from "@/components/app-shell";
import { loadActivityFeed } from "@/lib/activity-feed";
import { requireUser } from "@/lib/auth-guards";

export default async function AllActivityPage() {
  const user = await requireUser("/activity");
  const items = await loadActivityFeed({ viewerUserId: user.id });

  return (
    <>
      <AppShell title="Activity" withBottomNav>
        <ActivityFeed
          items={items}
          emptyDescription="Expenses, comments, and payments from all your groups will show up here."
        />
      </AppShell>
      <AppBottomNav />
    </>
  );
}
