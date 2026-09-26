"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import {
  AddPersonPanel,
  type AddPersonFriend,
} from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of the add-expense flow while you're the only member.
 * State lives here, not in the page: adding someone revalidates the page,
 * and the invite follow-up has to survive that refresh.
 */
export function SoloGroupGate({
  groupId,
  initiallySolo,
  isAdmin,
  friends,
  children,
}: {
  groupId: string;
  initiallySolo: boolean;
  isAdmin: boolean;
  friends: AddPersonFriend[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [solo, setSolo] = useState(initiallySolo);

  if (!solo) return children;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Users className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Add someone to split with</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;re the only one in this group so far.
        </p>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border p-4">
          <AddPersonPanel
            groupId={groupId}
            friends={friends}
            onAdded={() => {}}
            onDone={() => {
              setSolo(false);
              router.refresh();
            }}
          />
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            Ask a group admin to add people.
          </p>
          <Button asChild variant="outline">
            <Link href={`/g/${groupId}/members`}>View members</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
