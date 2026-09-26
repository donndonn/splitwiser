"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SearchHit } from "@/lib/friends";
import { cn } from "@/lib/utils";
import { sendFriendRequestAction } from "./actions";
import { searchFriendsAction } from "./search-action";

export function FriendSearch({ hasUsername }: { hasUsername: boolean }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchHit | null | undefined>(undefined);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Find friends"
        >
          <UserPlus className="size-5" />
        </Button>
      </SheetTrigger>
      {/* Top sheet: a bottom sheet sits under the iOS keyboard, which does
          not resize the layout viewport. */}
      <SheetContent
        side="top"
        className={cn(
          "mx-auto max-h-[min(32rem,85vh)] max-w-lg gap-3 rounded-b-3xl border-border/70 pb-5",
          "pt-[env(safe-area-inset-top)] [&>[data-slot=sheet-close]]:top-[calc(env(safe-area-inset-top)+0.75rem)]",
        )}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Find friends</SheetTitle>
          <SheetDescription>
            Search by exact email, phone number, or @username.
            {!hasUsername ? (
              <>
                {" "}
                Set a username on your{" "}
                <Link href="/profile" className="underline underline-offset-2">
                  profile
                </Link>{" "}
                so others can find you.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            startTransition(async () => {
              try {
                const hit = await searchFriendsAction(q);
                setResult(hit);
                if (!hit) toast.message("No user found");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Search failed",
                );
              }
            });
          }}
        >
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(undefined);
            }}
            placeholder="email, phone, or @username"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="email, phone, or @username"
          />
          <Button type="submit" disabled={pending} variant="secondary">
            {pending ? "…" : "Search"}
          </Button>
        </form>

        {result && (
          <div className="mx-4 flex items-center gap-3 rounded-lg border px-3 py-2">
            <Avatar className="size-9">
              <AvatarImage src={result.image ?? undefined} alt="" />
              <AvatarFallback>
                {result.displayName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {result.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {result.username ? `@${result.username}` : result.email}
              </p>
            </div>
            {result.status === "friends" ? (
              <span className="text-xs text-muted-foreground">Friends</span>
            ) : result.status === "outgoing" ? (
              <span className="text-xs text-muted-foreground">Requested</span>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await sendFriendRequestAction(result.id);
                      if (result.status === "incoming") {
                        toast.success("Friend request accepted");
                        setResult({ ...result, status: "friends" });
                      } else {
                        toast.success("Friend request sent");
                        setResult({ ...result, status: "outgoing" });
                      }
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Could not send",
                      );
                    }
                  });
                }}
              >
                {result.status === "incoming" ? "Accept" : "Add"}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
