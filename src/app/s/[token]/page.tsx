import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { getSharedGroupView } from "@/lib/share-link";
import { SharedGroupContent } from "./shared-group-content";

export default async function SharedGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ me?: string | string[] }>;
}) {
  const [{ token }, { me }] = await Promise.all([params, searchParams]);
  const view = await getSharedGroupView(db, token);
  if (!view) notFound();
  const canJoin = view.group.access === "join";

  return (
    <AppShell title={view.group.name}>
      {canJoin ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">
              You&apos;re invited to join
            </CardTitle>
            <CardDescription>
              Join to add expenses and settle up. You can look around first.
            </CardDescription>
            <Button asChild className="mt-2 w-full">
              <Link href={`/join/${encodeURIComponent(token)}`}>
                Join this group
              </Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5" aria-hidden />
          View-only link. Nothing here can be changed.
        </p>
      )}

      <SharedGroupContent
        view={view}
        token={token}
        viewerId={typeof me === "string" ? me : null}
      />

      {canJoin ? null : (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Want to add expenses yourself? Ask the group admin for an invite to
          Splitwiser.
        </p>
      )}
    </AppShell>
  );
}
