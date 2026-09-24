import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import { groups, members } from "@/db/schema";
import { requireMember } from "@/lib/auth-guards";
import {
  deleteGroupAction,
  leaveGroupAction,
  promoteAdminAction,
  updateGroupSettingsAction,
} from "./actions";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "JPY", "TWD", "HKD"];

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member: me } = await requireMember(id);

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);

  if (!group) return null;

  const roster = await db
    .select()
    .from(members)
    .where(eq(members.groupId, id))
    .orderBy(members.createdAt);

  return (
    <AppShell title="Settings" backHref={`/g/${id}`}>
      {me.isAdmin && (
        <form
          action={updateGroupSettingsAction.bind(null, id)}
          className="mb-8 space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Group name</Label>
            <Input id="name" name="name" defaultValue={group.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <NativeSelect
              id="currency"
              name="currency"
              defaultValue={group.currency}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" className="w-full">
            Save settings
          </Button>
        </form>
      )}

      {me.isAdmin && (
        <div className="mb-8 space-y-2">
          <h2 className="text-sm font-medium">Admins</h2>
          <ul className="space-y-2">
            {roster
              .filter((m) => m.userId != null)
              .map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {m.displayName}
                    {m.isAdmin ? " · admin" : ""}
                  </span>
                  {!m.isAdmin && (
                    <form action={promoteAdminAction.bind(null, id, m.id)}>
                      <Button type="submit" size="sm" variant="secondary">
                        Make admin
                      </Button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <Separator className="mb-6" />

      <form action={leaveGroupAction.bind(null, id)} className="mb-3">
        <Button type="submit" variant="outline" className="w-full">
          Leave group
        </Button>
      </form>

      {me.isAdmin && (
        <form action={deleteGroupAction.bind(null, id)}>
          <Button type="submit" variant="destructive" className="w-full">
            Delete group
          </Button>
        </form>
      )}
    </AppShell>
  );
}
