"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  USE_ACCOUNT_PHOTO_CHOICE_FIELD,
  USE_ACCOUNT_PHOTO_FIELD,
} from "@/lib/avatar";

export type JoinPlaceholder = {
  id: string;
  displayName: string;
};

type JoinAction = (formData: FormData) => void | Promise<void>;

/**
 * Each way of joining is its own form, and the placeholder id is a hidden
 * field. A submit button's name cannot carry it: React overwrites that name
 * to identify a `formAction`, then builds FormData without the submitter, so
 * the claim ran with an empty id and 500'd. In-app browsers resubmit that POST
 * on reload.
 */
export function JoinMembershipForms({
  token,
  placeholders,
  defaultName,
  accountPhoto,
  claimPlaceholderAction,
  joinAsNewMemberAction,
}: {
  token: string;
  placeholders: readonly JoinPlaceholder[];
  defaultName: string;
  accountPhoto: { image: string; provider: string | null } | null;
  claimPlaceholderAction: JoinAction;
  joinAsNewMemberAction: JoinAction;
}) {
  const [usePhoto, setUsePhoto] = useState(true);
  const hasPlaceholders = placeholders.length > 0;

  return (
    <div className="space-y-6">
      {accountPhoto ? (
        <label className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <Avatar className="size-10">
            <AvatarImage src={accountPhoto.image} alt="" />
            <AvatarFallback>
              {defaultName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">
              Use your {accountPhoto.provider ?? "account"} photo
            </span>
            <span className="block text-muted-foreground">
              You can change it anytime in Profile.
            </span>
          </span>
          <input
            type="checkbox"
            checked={usePhoto}
            onChange={(event) => setUsePhoto(event.target.checked)}
            className="size-5 shrink-0 accent-primary"
          />
        </label>
      ) : null}

      {hasPlaceholders ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Already on the list?</p>
          <ul className="space-y-2">
            {placeholders.map((placeholder) => (
              <li key={placeholder.id}>
                <form action={claimPlaceholderAction}>
                  <input type="hidden" name="token" value={token} />
                  <input
                    type="hidden"
                    name="memberId"
                    value={placeholder.id}
                  />
                  {accountPhoto ? <PhotoFields usePhoto={usePhoto} /> : null}
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full justify-between"
                    size="lg"
                  >
                    <span>{placeholder.displayName}</span>
                    <span className="text-muted-foreground">Join as</span>
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={joinAsNewMemberAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        {accountPhoto ? <PhotoFields usePhoto={usePhoto} /> : null}
        <div className="space-y-2">
          <Label htmlFor="displayName">
            {hasPlaceholders ? "Or join as" : "Join as"}
          </Label>
          <Input
            id="displayName"
            name="displayName"
            placeholder="Your name"
            defaultValue={hasPlaceholders ? undefined : defaultName}
            required
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          variant={hasPlaceholders ? "secondary" : "default"}
          size="lg"
        >
          Join group
        </Button>
      </form>
    </div>
  );
}

function PhotoFields({ usePhoto }: { usePhoto: boolean }) {
  return (
    <>
      <input
        type="hidden"
        name={USE_ACCOUNT_PHOTO_CHOICE_FIELD}
        value="1"
      />
      {usePhoto ? (
        <input type="hidden" name={USE_ACCOUNT_PHOTO_FIELD} value="on" />
      ) : null}
    </>
  );
}
