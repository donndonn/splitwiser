import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth-guards";
import { createGroupAction } from "./actions";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "JPY", "TWD", "HKD"];

export default async function NewGroupPage() {
  const user = await requireUser("/new");
  const defaultName =
    user.name?.trim() || user.email?.split("@")[0] || "Me";

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

        <Button type="submit" className="w-full" size="lg">
          Create group
        </Button>
      </form>
    </AppShell>
  );
}
