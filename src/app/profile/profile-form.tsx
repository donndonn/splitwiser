"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  SettingsSection,
  settingsEditRowClass as editRowClass,
  settingsInputClass as inputClass,
  settingsLabelClass,
  settingsRowClass,
  settingsValueClass,
} from "@/components/settings-list";
import { Button } from "@/components/ui/button";
import { parseVenmoUsername } from "@/lib/venmo";
import { cn } from "@/lib/utils";
import { updateProfileAction } from "./actions";
import { PhoneSection } from "./phone-section";

/** Grows with its text so a leading "@" stays right next to it. */
const prefixedInputClass = "field-sizing-content min-w-[4ch] max-w-full pl-0.5";

export function ProfileForm({
  name,
  username,
  email,
  venmoUsername,
  phone,
  smsEnabled,
}: {
  name: string;
  username: string | null;
  email: string | null;
  venmoUsername: string | null;
  phone: string | null;
  smsEnabled: boolean;
}) {
  const needsUsernameSetup = !username;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(needsUsernameSetup);
  const [savedName, setSavedName] = useState(name);
  const [savedUsername, setSavedUsername] = useState(username);
  const [savedVenmo, setSavedVenmo] = useState(venmoUsername);
  const [nameValue, setNameValue] = useState(name);
  const [usernameValue, setUsernameValue] = useState(username ?? "");
  const [venmoValue, setVenmoValue] = useState(venmoUsername ?? "");

  function startEditing() {
    setNameValue(savedName);
    setUsernameValue(savedUsername ?? "");
    setVenmoValue(savedVenmo ?? "");
    setEditing(true);
  }

  function cancelEditing() {
    setNameValue(savedName);
    setUsernameValue(savedUsername ?? "");
    setVenmoValue(savedVenmo ?? "");
    if (savedUsername) {
      setEditing(false);
    } else {
      window.location.href = "/";
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let venmo: string | null;
    try {
      venmo = parseVenmoUsername(venmoValue);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
      return;
    }
    const formData = new FormData();
    formData.set("name", nameValue);
    formData.set("username", usernameValue);
    formData.set("venmo", venmo ?? "");
    startTransition(async () => {
      try {
        await updateProfileAction(formData);
        setSavedName(nameValue.trim());
        setSavedUsername(usernameValue.trim().replace(/^@+/, "").toLowerCase());
        setSavedVenmo(venmo);
        toast.success("Profile saved");
        setEditing(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save profile",
        );
      }
    });
  }

  return (
    <form className="mb-6" onSubmit={onSubmit}>
      <SettingsSection
        id="account-heading"
        title="Account"
        className="mb-3"
        action={
          editing ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Edit profile"
              onClick={startEditing}
            >
              <Pencil />
              Edit
            </Button>
          )
        }
      >
        <div className={cn(settingsRowClass, editing && editRowClass)}>
          <label htmlFor={editing ? "name" : undefined} className={settingsLabelClass}>
            Display name
          </label>
          {editing ? (
            <input
              id="name"
              name="name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              maxLength={50}
              required
              className={cn(inputClass, "flex-1")}
            />
          ) : (
            <span className={settingsValueClass}>{savedName}</span>
          )}
        </div>

        <div className={cn(settingsRowClass, editing && editRowClass)}>
          <label
            htmlFor={editing ? "username" : undefined}
            className={settingsLabelClass}
          >
            Username
          </label>
          {editing ? (
            <span className="ml-auto flex min-w-0 flex-1 items-center justify-end">
              <span className="select-none text-muted-foreground">@</span>
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
                className={cn(inputClass, prefixedInputClass)}
              />
            </span>
          ) : (
            <span className={settingsValueClass}>
              <span className="text-muted-foreground">@</span>
              {savedUsername}
            </span>
          )}
        </div>

        <div className={settingsRowClass}>
          <span className={settingsLabelClass}>Email</span>
          <span className={cn(settingsValueClass, "font-normal text-muted-foreground")}>
            {email}
          </span>
        </div>

        {smsEnabled || phone ? (
          <PhoneSection phone={phone} enabled={smsEnabled} editing={editing} />
        ) : null}

        <div className={cn(settingsRowClass, editing && editRowClass)}>
          <label htmlFor={editing ? "venmo" : undefined} className={settingsLabelClass}>
            Venmo
          </label>
          {editing ? (
            <span className="ml-auto flex min-w-0 flex-1 items-center justify-end">
              <span className="select-none text-muted-foreground">@</span>
              <input
                id="venmo"
                name="venmo"
                value={venmoValue}
                onChange={(e) =>
                  setVenmoValue(e.target.value.replace(/^@+/, ""))
                }
                placeholder="your-venmo"
                maxLength={30}
                pattern="[A-Za-z0-9_-]*"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={cn(inputClass, prefixedInputClass)}
              />
            </span>
          ) : (
            <span className={settingsValueClass}>
              {savedVenmo ? (
                <>
                  <span className="text-muted-foreground">@</span>
                  {savedVenmo}
                </>
              ) : (
                <span className="font-normal text-muted-foreground">
                  Not set
                </span>
              )}
            </span>
          )}
        </div>
      </SettingsSection>

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
      ) : null}
    </form>
  );
}
