"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushAction,
} from "@/app/profile/push-actions";
import {
  settingsLabelClass,
  settingsRowClass,
} from "@/components/settings-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PushState =
  | "loading"
  | "needs-install"
  | "unsupported"
  | "blocked"
  | "off"
  | "on";

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Profile row to opt this device in or out of push notifications. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: PushState) => {
      if (!cancelled) setState(next);
    };

    if (!pushSupported()) {
      // iOS only offers Web Push to apps added to the Home Screen.
      settle(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      settle("blocked");
      return;
    }

    void currentSubscription()
      .then((subscription) => {
        if (subscription && Notification.permission === "granted") {
          // Re-save in case the server dropped or never stored it.
          void savePushSubscriptionAction(subscription.toJSON());
          settle("on");
        } else {
          settle("off");
        }
      })
      .catch(() => settle("off"));

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      // Must run straight from the tap, or browsers refuse to ask.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(vapidPublicKey),
        }));
      const result = await savePushSubscriptionAction(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe().catch(() => {});
        toast.error("Couldn't turn on notifications. Try again.");
        return;
      }
      setState("on");
      toast.success("Notifications are on for this device");
    } catch {
      toast.error("Couldn't turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      toast.error("Couldn't turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await sendTestPushAction();
    } catch {
      toast.error("Couldn't send a test notification.");
    } finally {
      setBusy(false);
    }
  }

  const hint =
    state === "needs-install"
      ? "Add to Home Screen first"
      : state === "unsupported"
        ? "Not available in this browser"
        : state === "blocked"
          ? "Blocked in browser settings"
          : null;

  return (
    <div className={cn(settingsRowClass, "py-2 pr-2")}>
      <span className={settingsLabelClass}>Notifications</span>
      <div className="ml-auto flex items-center gap-1.5">
        {hint ? (
          <span className="pr-2 text-right text-sm text-muted-foreground">
            {hint}
          </span>
        ) : state === "on" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={sendTest}
            >
              Send test
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={turnOff}
            >
              Turn off
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || state === "loading"}
            onClick={turnOn}
          >
            Turn on
          </Button>
        )}
      </div>
    </div>
  );
}
