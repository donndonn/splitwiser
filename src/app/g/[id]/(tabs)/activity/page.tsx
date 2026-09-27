import { ActivityFeed } from "@/components/activity-feed";
import { AppShell } from "@/components/app-shell";
import { loadActivityFeed } from "@/lib/activity-feed";
import { requireMember } from "@/lib/auth-guards";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireMember(id);
  const items = await loadActivityFeed({ viewerUserId: user.id, groupId: id });

  return (
    <AppShell title="Activity" backHref={`/g/${id}`}>
      <ActivityFeed
        items={items}
        emptyDescription="Expense changes, comments, payments, and membership updates will show up here."
      />
    </AppShell>
  );
}
