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

type ClaimAction = (
  memberId: string,
  formData: FormData,
) => void | Promise<void>;
type JoinAction = (formData: FormData) => void | Promise<void>;

/**
 * One form, so the photo choice applies to every way of joining. The
 * placeholder id is bound to the action: React drops name/value on a submit
 * button whose formAction is a server action, which made the claim throw.
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
  claimPlaceholderAction: ClaimAction;
  joinAsNewMemberAction: JoinAction;
}) {
  const hasPlaceholders = placeholders.length > 0;

  return (
    <form action={joinAsNewMemberAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

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
            type="hidden"
            name={USE_ACCOUNT_PHOTO_CHOICE_FIELD}
            value="1"
          />
          <input
            type="checkbox"
            name={USE_ACCOUNT_PHOTO_FIELD}
            defaultChecked
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
                <Button
                  type="submit"
                  formAction={claimPlaceholderAction.bind(null, placeholder.id)}
                  formNoValidate
                  variant="outline"
                  className="w-full justify-between"
                  size="lg"
                >
                  <span>{placeholder.displayName}</span>
                  <span className="text-muted-foreground">Join as</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
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
      </div>
    </form>
  );
}
