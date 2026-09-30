"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Last resort when a join POST throws outside the action. Reload on the
 * generic error page resubmits that POST; this link is a GET of the invite.
 */
export default function JoinError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  return (
    <AppShell title="Join group" backHref="/">
      <Card>
        <CardHeader>
          <CardTitle>Couldn&apos;t join</CardTitle>
          <CardDescription>
            Something went wrong while joining this group. Go back to the
            invite and try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full" size="lg">
            <Link href={pathname || "/"}>Back to invite</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => reset()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
