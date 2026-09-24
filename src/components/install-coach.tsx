"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SESSION_KEY,
  STORAGE_KEY,
  bootCoach,
  memoryFromStore,
  memoryToStore,
  stepCoach,
  viewOf,
  type CoachEvent,
  type CoachState,
  type CoachView,
  type EnvSignals,
  type Persisted,
} from "@/lib/install-coach";

const BLANK: CoachState = { tag: "blank" };
const DISPLAY_MODES = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
] as const;

let snapshots: Record<"home" | "profile", CoachState> = {
  home: BLANK,
  profile: BLANK,
};
let mounts = 0;
let deferredPrompt: InstallPromptEvent | null = null;
let prompting = false;
const listeners = new Set<() => void>();

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getServerSnapshot() {
  return BLANK;
}

function publish(venue: "home" | "profile", next: CoachState) {
  if (Object.is(next, snapshots[venue])) return;
  snapshots = { ...snapshots, [venue]: next };
  for (const listener of listeners) listener();
}

function boot(venue: "home" | "profile") {
  publish(venue, readBoot(venue));
}

function readBoot(venue: "home" | "profile"): CoachState {
  const now = Date.now();
  return bootCoach({
    venue,
    signals: readSignals(),
    memory: readMemory(now),
    session: readSession(),
    now,
  });
}

function memoryOf(value: CoachState): Persisted | null {
  if (value.tag === "home" || value.tag === "profile") return value.memory;
  return null;
}

function sameMemory(a: Persisted, b: Persisted) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "snoozed" && b.kind === "snoozed") return a.until === b.until;
  return true;
}

function dispatch(event: CoachEvent) {
  for (const venue of ["home", "profile"] as const) {
    const prev = snapshots[venue];
    if (prev.tag === "blank") continue;
    const next = stepCoach(prev, event);
    if (Object.is(next, prev)) continue;
    if (event.type === "became-installed") {
      writeMemory({ kind: "retired" });
    } else {
      const before = memoryOf(prev);
      const after = memoryOf(next);
      if (after && (!before || !sameMemory(before, after))) writeMemory(after);
    }
    if (
      prev.tag === "home" &&
      prev.phase === "armed" &&
      next.tag === "home" &&
      next.phase === "visible"
    ) {
      markSessionSpent();
    }
    publish(venue, next);
  }
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  dispatch({ type: "bip-captured" });
}

function onAppInstalled() {
  deferredPrompt = null;
  dispatch({ type: "became-installed" });
}

function retainWindowEvents() {
  if (mounts === 0) {
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
  }
  mounts += 1;
}

function releaseWindowEvents() {
  mounts -= 1;
  if (mounts === 0) {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
  }
}

async function promptInstall(): Promise<"accepted" | "dismissed" | "failed"> {
  const event = deferredPrompt;
  if (!event) return "failed";
  try {
    await event.prompt();
    const choice = await event.userChoice;
    deferredPrompt = null;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    deferredPrompt = null;
    return "failed";
  }
}

async function onInstall() {
  if (prompting) return;
  prompting = true;
  try {
    const result = await promptInstall();
    if (result === "accepted") dispatch({ type: "prompt-accepted" });
    else if (result === "dismissed") {
      dispatch({ type: "prompt-dismissed", now: Date.now() });
    } else dispatch({ type: "prompt-failed" });
  } finally {
    prompting = false;
  }
}

function readMemory(now: number): Persisted {
  return memoryFromStore(readStorageItem(localStorage, STORAGE_KEY), now);
}

function writeMemory(memory: Persisted) {
  const raw = memoryToStore(memory);
  try {
    if (raw == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Private mode and some webviews throw on storage access.
  }
}

function readSession(): "fresh" | "spent" {
  return readStorageItem(sessionStorage, SESSION_KEY) === "spent"
    ? "spent"
    : "fresh";
}

function markSessionSpent() {
  try {
    sessionStorage.setItem(SESSION_KEY, "spent");
  } catch {
    // Private mode and some webviews throw on storage access.
  }
}

function readStorageItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readSignals(): EnvSignals {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    displayMode: readDisplayMode(),
    navigatorStandalone: nav.standalone === true,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    bipCaptured: deferredPrompt !== null,
  };
}

function readDisplayMode(): EnvSignals["displayMode"] {
  for (const mode of DISPLAY_MODES) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode;
  }
  return "browser";
}

export function InstallCoach({ venue }: { venue: "home" | "profile" }) {
  const getClientSnapshot = useCallback(() => snapshots[venue], [venue]);
  const snapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    retainWindowEvents();
    boot(venue);
    return releaseWindowEvents;
  }, [venue]);

  useEffect(() => {
    if (snapshot.tag !== "home" || snapshot.phase !== "armed") return;
    const delay = Math.max(0, snapshot.showAt - Date.now());
    const id = window.setTimeout(() => {
      dispatch({ type: "tick", now: Date.now() });
    }, delay);
    return () => window.clearTimeout(id);
  }, [snapshot]);

  const view = viewOf(snapshot).view;
  if (view === "silent") return null;
  if (view === "profile-row") {
    return (
      <section className="mb-6 space-y-2" aria-labelledby="home-screen-heading">
        <h2 id="home-screen-heading" className="text-sm font-medium">
          Home screen
        </h2>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => dispatch({ type: "expand" })}
        >
          Add to Home Screen
        </Button>
      </section>
    );
  }

  return <CoachCard view={view} live={venue === "home"} />;
}

function CoachCard({
  view,
  live,
}: {
  view: Exclude<CoachView["view"], "silent" | "profile-row">;
  live: boolean;
}) {
  return (
    <Card
      className="mb-4"
      size="sm"
      {...(live ? { "aria-live": "polite" as const } : {})}
    >
      {view === "native" ? (
        <CardHeader>
          <CardTitle>Install Splitwiser</CardTitle>
          <CardDescription>
            Keep groups one tap away, without the browser bar.
          </CardDescription>
        </CardHeader>
      ) : (
        <CardContent>
          {view === "ios-steps" ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                Tap{" "}
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 align-middle text-foreground">
                  <Share className="size-3.5" aria-hidden="true" />
                  Share
                </span>{" "}
                in the Safari toolbar.
              </li>
              <li>Scroll and tap Add to Home Screen.</li>
              <li>Tap Add.</li>
            </ol>
          ) : (
            <p>
              From the browser menu, choose Install app or Add to Home Screen.
            </p>
          )}
        </CardContent>
      )}
      <CardFooter className="flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "not-now", now: Date.now() })}
        >
          Not now
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "retire" })}
        >
          Don&apos;t show again
        </Button>
        {view === "native" ? (
          <Button type="button" size="sm" onClick={() => void onInstall()}>
            Install
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
