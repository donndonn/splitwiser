"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";

export function ProfileForm({
  name,
  username,
  email,
}: {
  name: string;
  username: string | null;
  email: string | null;
}) {
  const needsUsernameSetup = !username;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(needsUsernameSetup);
  const [savedName, setSavedName] = useState(name);
  const [savedUsername, setSavedUsername] = useState(username);
  const [nameValue, setNameValue] = useState(name);
  const [usernameValue, setUsernameValue] = useState(username ?? "");

  function startEditing() {
    setNameValue(savedName);
    setUsernameValue(savedUsername ?? "");
    setEditing(true);
  }

  function cancelEditing() {
    setNameValue(savedName);
    setUsernameValue(savedUsername ?? "");
    if (savedUsername) {
      setEditing(false);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.set("name", nameValue);
        formData.set("username", usernameValue);
        startTransition(async () => {
          try {
            await updateProfileAction(formData);
            setSavedName(nameValue.trim());
            setSavedUsername(usernameValue.trim().replace(/^@+/, "").toLowerCase());
            toast.success("Profile saved");
            setEditing(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Could not save profile",
            );
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={editing ? "name" : undefined}>Display name</Label>
        {editing ? (
          <input
            id="name"
            name="name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            maxLength={50}
            required
            className="flex h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 md:text-sm"
          />
        ) : (
          <div className="flex h-11 items-center rounded-xl border bg-muted/40 px-3.5 text-sm font-medium">
            {savedName}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Shown to friends and used as your default name when added to a group.
          Per-group nicknames stay separate.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={editing ? "username" : undefined}>Username</Label>
        {editing ? (
          <div className="flex h-11 items-center rounded-xl border border-input bg-card px-3.5 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
            <span className="select-none text-sm leading-none text-muted-foreground">
              @
            </span>
            <input
              id="username"
              name="username"
              value={usernameValue}
              onChange={(e) => setUsernameValue(e.target.value)}
              placeholder="yourname"
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
              required
              className="h-full min-w-0 flex-1 bg-transparent pl-0.5 text-base outline-none placeholder:text-muted-foreground/70 md:text-sm"
            />
          </div>
        ) : (
          <div className="flex h-11 items-center rounded-xl border bg-muted/40 px-3.5 text-sm font-medium tracking-tight">
            <span className="text-muted-foreground">@</span>
            <span>{savedUsername}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Unique handle friends can search for. 3–20 characters: letters,
          numbers, underscores.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <div className="flex h-11 items-center rounded-xl border bg-muted/40 px-3.5 text-sm text-muted-foreground">
          {email}
        </div>
        <p className="text-xs text-muted-foreground">
          Friends can also find you by this email.
        </p>
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={cancelEditing}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={startEditing}
        >
          Edit profile
        </Button>
      )}
    </form>
  );
}
