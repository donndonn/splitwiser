export const INSTALL_SHEET_TITLE = "Install Splitwiser";
export const INSTALL_SHEET_BODY =
  "For the best experience, add Splitwiser to your home screen.";

export const IOS_INSTALL_STEPS = [
  "Open the browser menu (⋯) at the bottom of the screen.",
  "Tap Share.",
  "If Add to Home Screen is not visible, tap View More.",
  "Tap Add to Home Screen.",
  "Tap Add.",
] as const;

export const CHROME_IOS_INSTALL_STEPS = [
  "Tap Share in the address bar at the top of the screen.",
  "If Add to Home Screen is not visible, tap View More.",
  "Tap Add to Home Screen.",
  "Tap Add on the confirm sheet.",
] as const;

export const GENERIC_INSTALL_HINT =
  "Open the browser menu and choose Install app or Add to Home Screen.";

export const APPEAR_DELAY_MS = 2_000;
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const STORAGE_KEY = "splitwiser.install-coach";
export const SESSION_KEY = "splitwiser.install-coach.shot";

export type Surface = "native" | "ios" | "chrome-ios" | "generic";

export type Persisted =
  | { kind: "open" }
  | { kind: "snoozed"; until: number }
  | { kind: "retired" };

type HomeFields = {
  tag: "home";
  surface: Surface;
  memory: Persisted;
};

export type CoachState =
  | { tag: "blank" }
  | { tag: "installed" }
  | (HomeFields & { phase: "armed"; showAt: number })
  | (HomeFields & { phase: "visible" | "resting" })
  | {
      tag: "profile";
      phase: "row" | "open";
      surface: Surface;
      memory: Persisted;
    };

export type CoachView =
  | { view: "silent" }
  | { view: "profile-row" }
  | { view: "native" }
  | { view: "ios-steps" }
  | { view: "chrome-ios-steps" }
  | { view: "generic-steps" };

export type EnvSignals = {
  displayMode:
    | "browser"
    | "standalone"
    | "minimal-ui"
    | "fullscreen"
    | "window-controls-overlay";
  navigatorStandalone: boolean;
  referrer: string;
  userAgent: string;
  maxTouchPoints: number;
  bipCaptured: boolean;
};

export type BootInput = {
  venue: "home" | "profile";
  signals: EnvSignals;
  memory: Persisted;
  session: "fresh" | "spent";
  now: number;
};

export type CoachEvent =
  | { type: "tick"; now: number }
  | { type: "bip-captured" }
  | { type: "not-now"; now: number }
  | { type: "retire" }
  | { type: "prompt-accepted" }
  | { type: "prompt-dismissed"; now: number }
  | { type: "prompt-failed" }
  | { type: "expand" }
  | { type: "collapse" }
  | { type: "became-installed" };

type StoredV1 =
  | { v: 1; kind: "retired" }
  | { v: 1; kind: "snoozed"; until: number };

const IOS_UA = /iPad|iPhone|iPod/;
const MAC_UA = /Macintosh/;
const CHROME_IOS_UA = /CriOS/;

export function memoryFromStore(raw: string | null, now: number): Persisted {
  if (raw == null) return { kind: "open" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "open" };
  }
  if (!isRecord(parsed) || parsed.v !== 1) return { kind: "open" };
  if (parsed.kind === "retired") return { kind: "retired" };
  if (parsed.kind !== "snoozed") return { kind: "open" };
  const until = parsed.until;
  if (typeof until !== "number" || !Number.isFinite(until) || until <= now) {
    return { kind: "open" };
  }
  return { kind: "snoozed", until };
}

export function memoryToStore(memory: Persisted): string | null {
  if (memory.kind === "open") return null;
  const stored: StoredV1 =
    memory.kind === "retired"
      ? { v: 1, kind: "retired" }
      : { v: 1, kind: "snoozed", until: memory.until };
  return JSON.stringify(stored);
}

export function bootCoach(input: BootInput): CoachState {
  const surface = classify(input.signals);
  if (surface === "installed") return { tag: "installed" };

  if (input.venue === "profile") {
    return {
      tag: "profile",
      phase: "row",
      surface,
      memory: input.memory,
    };
  }

  const snoozed =
    input.memory.kind === "snoozed" && input.memory.until > input.now;
  if (input.memory.kind === "retired" || snoozed || input.session === "spent") {
    return {
      tag: "home",
      phase: "resting",
      surface,
      memory: input.memory,
    };
  }

  return {
    tag: "home",
    phase: "armed",
    surface,
    memory: { kind: "open" },
    showAt: input.now + APPEAR_DELAY_MS,
  };
}

export function stepCoach(state: CoachState, event: CoachEvent): CoachState {
  if (state.tag === "blank" || state.tag === "installed") return state;
  if (event.type === "became-installed") return { tag: "installed" };

  if (event.type === "bip-captured") {
    if (state.tag === "home" && state.phase === "resting") return state;
    if (state.surface === "native" || state.surface === "chrome-ios") {
      return state;
    }
    return { ...state, surface: "native" };
  }

  if (state.tag === "home") return stepHome(state, event);
  return stepProfile(state, event);
}

export function viewOf(state: CoachState): CoachView {
  switch (state.tag) {
    case "blank":
    case "installed":
      return { view: "silent" };
    case "home":
      if (state.phase !== "visible") return { view: "silent" };
      return viewForSurface(state.surface);
    case "profile":
      if (state.phase === "row") return { view: "profile-row" };
      return viewForSurface(state.surface);
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function stepHome(
  state: Extract<CoachState, { tag: "home" }>,
  event: CoachEvent,
): CoachState {
  if (state.phase === "armed" && event.type === "tick") {
    if (event.now < state.showAt) return state;
    return {
      tag: "home",
      phase: "visible",
      surface: state.surface,
      memory: state.memory,
    };
  }
  if (state.phase !== "visible") return state;
  if (event.type === "not-now" || event.type === "prompt-dismissed") {
    return {
      ...state,
      phase: "resting",
      memory: { kind: "snoozed", until: event.now + SNOOZE_MS },
    };
  }
  if (event.type === "retire" || event.type === "prompt-accepted") {
    return { ...state, phase: "resting", memory: { kind: "retired" } };
  }
  if (event.type === "prompt-failed" && state.surface === "native") {
    return { ...state, surface: "generic" };
  }
  return state;
}

function stepProfile(
  state: Extract<CoachState, { tag: "profile" }>,
  event: CoachEvent,
): CoachState {
  if (state.phase === "row") {
    if (event.type === "expand") return { ...state, phase: "open" };
    return state;
  }
  if (event.type === "collapse") return { ...state, phase: "row" };
  if (event.type === "not-now" || event.type === "prompt-dismissed") {
    return {
      ...state,
      phase: "row",
      memory: { kind: "snoozed", until: event.now + SNOOZE_MS },
    };
  }
  if (event.type === "retire" || event.type === "prompt-accepted") {
    return { ...state, phase: "row", memory: { kind: "retired" } };
  }
  if (event.type === "prompt-failed" && state.surface === "native") {
    return { ...state, surface: "generic" };
  }
  return state;
}

function classify(signals: EnvSignals): Surface | "installed" {
  if (
    signals.displayMode !== "browser" ||
    signals.navigatorStandalone ||
    signals.referrer.startsWith("android-app://")
  ) {
    return "installed";
  }
  if (CHROME_IOS_UA.test(signals.userAgent)) return "chrome-ios";
  if (signals.bipCaptured) return "native";
  if (IOS_UA.test(signals.userAgent)) return "ios";
  if (MAC_UA.test(signals.userAgent) && signals.maxTouchPoints > 1) {
    return "ios";
  }
  return "generic";
}

function viewForSurface(surface: Surface): CoachView {
  switch (surface) {
    case "native":
      return { view: "native" };
    case "ios":
      return { view: "ios-steps" };
    case "chrome-ios":
      return { view: "chrome-ios-steps" };
    case "generic":
      return { view: "generic-steps" };
    default: {
      const unreachable: never = surface;
      return unreachable;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
