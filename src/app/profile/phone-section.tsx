"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/lib/phone";
import {
  confirmPhoneCodeAction,
  removePhoneAction,
  sendPhoneCodeAction,
} from "./phone-actions";

type Step =
  { kind: "view" } | { kind: "number" } | { kind: "code"; phone: string };

const inputClass =
  "flex h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base shadow-xs outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 md:text-sm";

/** Enter inside the profile form would submit it; run the phone step instead. */
function onEnter(action: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    action();
  };
}

export function PhoneSection({
  phone,
  enabled,
  editing,
}: {
  phone: string | null;
  /** False when Twilio is not configured; the number can't be changed. */
  enabled: boolean;
  /** Change/Remove only show while the profile form is in edit mode. */
  editing: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(phone);
  const [step, setStep] = useState<Step>({ kind: "view" });
  const [numberValue, setNumberValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (!editing) setStep({ kind: "view" });
  }

  function sendCode(raw: string) {
    startTransition(async () => {
      const result = await sendPhoneCodeAction(raw);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCodeValue("");
      setStep({ kind: "code", phone: result.value });
      toast.success(`Code sent to ${formatPhone(result.value)}`);
    });
  }

  function sendNumber() {
    if (numberValue.trim() && !pending) sendCode(numberValue);
  }

  function confirmCode() {
    if (step.kind !== "code" || !codeValue || pending) return;
    const { phone: target } = step;
    startTransition(async () => {
      const result = await confirmPhoneCodeAction(target, codeValue);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(target);
      setStep({ kind: "view" });
      toast.success("Phone number verified");
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={step.kind === "view" ? undefined : "phone"}>Phone</Label>

      {step.kind === "view" ? (
        <div className="flex h-11 items-center gap-2 rounded-xl border bg-muted/40 pl-3.5 pr-1.5 text-sm font-medium tracking-tight">
          <span className="min-w-0 flex-1 truncate">
            {saved ? (
              formatPhone(saved)
            ) : (
              <span className="font-normal text-muted-foreground">Not set</span>
            )}
          </span>
          {editing && enabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNumberValue("");
                setStep({ kind: "number" });
              }}
            >
              {saved ? "Change" : "Add"}
            </Button>
          ) : null}
          {editing && saved ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await removePhoneAction();
                    setSaved(null);
                    toast.success("Phone number removed");
                  } catch {
                    toast.error("Could not remove phone number");
                  }
                });
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ) : step.kind === "number" ? (
        <div className="space-y-2">
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="send"
            autoFocus
            value={numberValue}
            onChange={(e) => setNumberValue(e.target.value)}
            onKeyDown={onEnter(sendNumber)}
            placeholder="+1 415 555 0123"
            maxLength={32}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            We&apos;ll text you a code. US and Taiwan numbers only. Friends can
            find you by this number; it&apos;s never shown to others. Saved as
            soon as it&apos;s verified.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" disabled={pending} onClick={sendNumber}>
              {pending ? "Sending…" : "Send code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setStep({ kind: "view" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            id="phone"
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            autoFocus
            value={codeValue}
            onChange={(e) => setCodeValue(e.target.value.replace(/\D/g, ""))}
            onKeyDown={onEnter(confirmCode)}
            placeholder="6-digit code"
            maxLength={10}
            className={`${inputClass} tracking-widest`}
          />
          <p className="text-xs text-muted-foreground">
            Sent to {formatPhone(step.phone)}.{" "}
            <button
              type="button"
              className="underline underline-offset-2 disabled:opacity-50"
              disabled={pending}
              onClick={() => sendCode(step.phone)}
            >
              Resend
            </button>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" disabled={pending} onClick={confirmCode}>
              {pending ? "Checking…" : "Verify"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setStep({ kind: "view" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
