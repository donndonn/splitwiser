import { AppShell } from "@/components/app-shell";
import { ScanReceipt } from "@/components/scan-receipt";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";
import { createExpenseAction } from "../actions";

export default async function ScanReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMember(id);

  const [[group], roster] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, id)).limit(1),
    db
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(eq(members.groupId, id))
      .orderBy(members.createdAt),
  ]);

  if (!group) return null;

  const action = createExpenseAction.bind(null, id);

  return (
    <AppShell title="Scan receipt" backHref={`/g/${id}/expenses/new`} withBottomNav>
      <ScanReceipt
        groupId={id}
        members={roster}
        currency={group.currency}
        defaultPaidById={member.id}
        action={action}
      />
    </AppShell>
  );
}
