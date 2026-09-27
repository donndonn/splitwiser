"use client";

import { useRef, useTransition } from "react";
import { Camera, ImageUp, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AVATAR_IMAGE_FIELD } from "@/lib/avatar";
import { compressAvatarImage } from "@/lib/compress-avatar-image";
import { cn } from "@/lib/utils";
import {
  removeAvatarAction,
  switchToAccountPhotoAction,
  uploadAvatarAction,
} from "./actions";

/** The profile avatar; tapping it offers upload, provider photo, or remove. */
export function AvatarEditor({
  name,
  image,
  accountPhoto,
}: {
  name: string;
  image: string | null;
  accountPhoto: { image: string; provider: string | null } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const showsAccountPhoto = accountPhoto != null && image === accountPhoto.image;

  function run(work: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await work();
        toast.success(success);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update your photo",
        );
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          run(async () => {
            const formData = new FormData();
            formData.set(AVATAR_IMAGE_FIELD, await compressAvatarImage(file));
            await uploadAvatarAction(formData);
          }, "Photo updated");
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Change profile photo"
            disabled={pending}
            className="relative shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-60"
          >
            <Avatar className="size-14">
              <AvatarImage src={image ?? undefined} alt="" />
              <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground",
                pending && "animate-pulse",
              )}
            >
              <Camera className="size-3.5" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <ImageUp />
            Upload photo
          </DropdownMenuItem>
          {accountPhoto && !showsAccountPhoto ? (
            <DropdownMenuItem
              onSelect={() =>
                run(switchToAccountPhotoAction, "Photo updated")
              }
            >
              <UserRound />
              Use {accountPhoto.provider ?? "account"} photo
            </DropdownMenuItem>
          ) : null}
          {image ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => run(removeAvatarAction, "Photo removed")}
            >
              <Trash2 />
              Remove photo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
