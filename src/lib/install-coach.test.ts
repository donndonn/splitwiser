import { describe, expect, it } from "vitest";
import {
  CHROME_IOS_INSTALL_STEPS,
  GENERIC_INSTALL_HINT,
  INSTALL_SHEET_BODY,
  INSTALL_SHEET_TITLE,
  IOS_INSTALL_STEPS,
  bootCoach,
  memoryFromStore,
  memoryToStore,
  stepCoach,
  viewOf,
  type BootInput,
  type CoachState,
  type EnvSignals,
} from "./install-coach";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function signals(overrides: Partial<EnvSignals> = {}): EnvSignals {
  return {
    displayMode: "browser",
    navigatorStandalone: false,
    referrer: "",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    maxTouchPoints: 0,
    bipCaptured: false,
    ...overrides,
  };
}

function boot(overrides: Partial<BootInput> = {}): CoachState {
  return bootCoach({
    venue: "home",
    signals: signals(),
    memory: { kind: "open" },
    session: "fresh",
    now: 1_000,
    ...overrides,
  });
}

const homeVisible: CoachState = {
  tag: "home",
  phase: "visible",
  surface: "generic",
  memory: { kind: "open" },
};

describe("install sheet copy", () => {
  it("names the sheet and the Safari share path", () => {
    expect(INSTALL_SHEET_TITLE).toBe("Install Splitwiser");
    expect(INSTALL_SHEET_BODY).toBe(
      "For the best experience, add Splitwiser to your home screen.",
    );
    expect(IOS_INSTALL_STEPS).toEqual([
      "Open the browser menu (⋯) at the bottom of the screen.",
      "Tap Share.",
      "If Add to Home Screen is not visible, tap View More.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ]);
    expect(CHROME_IOS_INSTALL_STEPS).toEqual([
      "Tap Share in the address bar at the top of the screen.",
      "If Add to Home Screen is not visible, tap View More.",
      "Tap Add to Home Screen.",
      "Tap Add on the confirm sheet.",
    ]);
    expect(GENERIC_INSTALL_HINT).toContain("Install app");
    expect(GENERIC_INSTALL_HINT).toContain("Add to Home Screen");
  });
});

describe("memoryFromStore / memoryToStore", () => {
  it("treats null as open and stores open as deletion", () => {
    expect(memoryFromStore(null, 0)).toEqual({ kind: "open" });
    expect(memoryToStore({ kind: "open" })).toBe(null);
  });

  it("treats garbage, a foreign version, and a non-record as open", () => {
    expect(memoryFromStore("{", 0)).toEqual({ kind: "open" });
    expect(memoryFromStore("null", 0)).toEqual({ kind: "open" });
    expect(memoryFromStore("[]", 0)).toEqual({ kind: "open" });
    expect(
      memoryFromStore(JSON.stringify({ v: 2, kind: "retired" }), 0),
    ).toEqual({ kind: "open" });
  });

  it("round-trips retired", () => {
    expect(memoryToStore({ kind: "retired" })).toBe(
      '{"v":1,"kind":"retired"}',
    );
    expect(memoryFromStore('{"v":1,"kind":"retired"}', 0)).toEqual({
      kind: "retired",
    });
  });

  it("keeps a future snooze and drops an expired or non-numeric one", () => {
    expect(memoryToStore({ kind: "snoozed", until: 5_000 })).toBe(
      '{"v":1,"kind":"snoozed","until":5000}',
    );
    expect(
      memoryFromStore('{"v":1,"kind":"snoozed","until":5000}', 1_000),
    ).toEqual({ kind: "snoozed", until: 5_000 });
    expect(
      memoryFromStore('{"v":1,"kind":"snoozed","until":1000}', 1_000),
    ).toEqual({ kind: "open" });
    expect(
      memoryFromStore('{"v":1,"kind":"snoozed","until":999}', 1_000),
    ).toEqual({ kind: "open" });
    expect(
      memoryFromStore('{"v":1,"kind":"snoozed","until":"5000"}', 0),
    ).toEqual({ kind: "open" });
    expect(
      memoryFromStore('{"v":1,"kind":"snoozed","until":null}', 0),
    ).toEqual({ kind: "open" });
  });
});

describe("bootCoach", () => {
  it("is installed from each installed signal alone", () => {
    expect(
      boot({ signals: signals({ displayMode: "standalone" }) }),
    ).toEqual({ tag: "installed" });
    expect(
      boot({ signals: signals({ displayMode: "minimal-ui" }) }),
    ).toEqual({ tag: "installed" });
    expect(
      boot({ signals: signals({ displayMode: "fullscreen" }) }),
    ).toEqual({ tag: "installed" });
    expect(
      boot({ signals: signals({ displayMode: "window-controls-overlay" }) }),
    ).toEqual({ tag: "installed" });
    expect(
      boot({ signals: signals({ navigatorStandalone: true }) }),
    ).toEqual({ tag: "installed" });
    expect(
      boot({
        signals: signals({ referrer: "android-app://com.android.chrome" }),
      }),
    ).toEqual({ tag: "installed" });
  });

  it("does not treat a lookalike referrer as the installed app", () => {
    expect(
      boot({
        signals: signals({ referrer: "https://example.com/?android-app://" }),
      }).tag,
    ).toBe("home");
    expect(
      boot({ signals: signals({ referrer: "Android-app://com.example" }) }).tag,
    ).toBe("home");
  });

  it("lets a captured install event beat an iPhone user agent", () => {
    expect(
      boot({
        signals: signals({
          bipCaptured: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
          maxTouchPoints: 5,
        }),
      }),
    ).toEqual({
      tag: "home",
      phase: "armed",
      surface: "native",
      memory: { kind: "open" },
      showAt: 3_000,
    });
  });

  it("treats an installed display as installed even with a prompt and an iPhone", () => {
    expect(
      boot({
        signals: signals({
          displayMode: "standalone",
          bipCaptured: true,
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        }),
      }),
    ).toEqual({ tag: "installed" });
  });

  it("classifies Chrome on iPhone and iPad as chrome-ios, even with a prompt", () => {
    const crios =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1";
    expect(boot({ signals: signals({ userAgent: crios }) })).toMatchObject({
      tag: "home",
      surface: "chrome-ios",
    });
    expect(
      boot({
        signals: signals({
          userAgent: crios,
          bipCaptured: true,
          maxTouchPoints: 5,
        }),
      }),
    ).toMatchObject({ surface: "chrome-ios" });
    expect(
      boot({
        signals: signals({
          userAgent:
            "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
        }),
      }),
    ).toMatchObject({ surface: "chrome-ios" });
  });

  it("classifies iPhone, iPad, and iPod as ios", () => {
    for (const device of ["iPhone", "iPad", "iPod"]) {
      expect(
        boot({
          signals: signals({ userAgent: `Mozilla/5.0 (${device}; CPU OS)` }),
        }),
      ).toMatchObject({ tag: "home", surface: "ios" });
    }
  });

  it("classifies a touch Mac as ios and a click Mac as generic", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
    expect(
      boot({ signals: signals({ userAgent: mac, maxTouchPoints: 2 }) }),
    ).toMatchObject({ surface: "ios" });
    expect(
      boot({ signals: signals({ userAgent: mac, maxTouchPoints: 1 }) }),
    ).toMatchObject({ surface: "generic" });
    expect(
      boot({ signals: signals({ userAgent: mac, maxTouchPoints: 0 }) }),
    ).toMatchObject({ surface: "generic" });
  });

  it("arms a fresh open home visit two seconds out", () => {
    expect(boot({ now: 1_000 })).toEqual({
      tag: "home",
      phase: "armed",
      surface: "generic",
      memory: { kind: "open" },
      showAt: 3_000,
    });
  });

  it("rests a home visit that already showed in this tab", () => {
    expect(boot({ session: "spent", now: 4_000 })).toEqual({
      tag: "home",
      phase: "resting",
      surface: "generic",
      memory: { kind: "open" },
    });
  });

  it("rests a future snooze and arms an expired one as open", () => {
    expect(
      boot({
        now: 1_000,
        memory: { kind: "snoozed", until: 1_001 },
      }),
    ).toEqual({
      tag: "home",
      phase: "resting",
      surface: "generic",
      memory: { kind: "snoozed", until: 1_001 },
    });
    expect(
      boot({
        now: 1_000,
        memory: { kind: "snoozed", until: 1_000 },
      }),
    ).toEqual({
      tag: "home",
      phase: "armed",
      surface: "generic",
      memory: { kind: "open" },
      showAt: 3_000,
    });
  });

  it("rests a retired home and keeps the retired memory", () => {
    expect(boot({ memory: { kind: "retired" }, now: 8 })).toEqual({
      tag: "home",
      phase: "resting",
      surface: "generic",
      memory: { kind: "retired" },
    });
  });

  it("shows a profile row for retired memory and ignores session and delay", () => {
    expect(
      boot({
        venue: "profile",
        session: "spent",
        now: 50,
        memory: { kind: "retired" },
      }),
    ).toEqual({
      tag: "profile",
      phase: "row",
      surface: "generic",
      memory: { kind: "retired" },
    });
    expect(
      boot({
        venue: "profile",
        session: "spent",
        now: 50,
        memory: { kind: "snoozed", until: 9_000 },
        signals: signals({
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        }),
      }),
    ).toEqual({
      tag: "profile",
      phase: "row",
      surface: "ios",
      memory: { kind: "snoozed", until: 9_000 },
    });
  });
});

describe("stepCoach / viewOf", () => {
  it("shows chrome-ios steps and ignores a later install prompt", () => {
    const crios =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1";
    const armed = boot({
      now: 0,
      signals: signals({ userAgent: crios, maxTouchPoints: 5 }),
    });
    const showing = stepCoach(armed, { type: "tick", now: 2_000 });
    expect(viewOf(showing)).toEqual({ view: "chrome-ios-steps" });
    expect(showing).toMatchObject({
      tag: "home",
      phase: "visible",
      surface: "chrome-ios",
    });
    expect(stepCoach(showing, { type: "bip-captured" })).toBe(showing);
    const open: CoachState = {
      tag: "profile",
      phase: "open",
      surface: "chrome-ios",
      memory: { kind: "open" },
    };
    expect(stepCoach(open, { type: "bip-captured" })).toBe(open);
    expect(viewOf(open)).toEqual({ view: "chrome-ios-steps" });
  });

  it("shows ios steps after the delay and stays silent before it", () => {
    const armed = boot({
      now: 0,
      signals: signals({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        maxTouchPoints: 5,
      }),
    });
    expect(viewOf(armed)).toEqual({ view: "silent" });
    expect(stepCoach(armed, { type: "tick", now: 1_999 })).toBe(armed);
    const showing = stepCoach(armed, { type: "tick", now: 2_000 });
    expect(viewOf(showing)).toEqual({ view: "ios-steps" });
    expect(showing).toMatchObject({ tag: "home", phase: "visible", surface: "ios" });
  });

  it("keeps an armed native surface silent until the tick", () => {
    const armed = boot({ now: 0 });
    const nativeArmed = stepCoach(armed, { type: "bip-captured" });
    expect(nativeArmed).toEqual({ ...armed, surface: "native" });
    expect(viewOf(nativeArmed)).toEqual({ view: "silent" });
    const showing = stepCoach(nativeArmed, { type: "tick", now: 2_000 });
    expect(viewOf(showing)).toEqual({ view: "native" });
    expect(showing).toMatchObject({ phase: "visible", surface: "native" });
  });

  it("swaps a visible generic card to native without a new phase", () => {
    const next = stepCoach(homeVisible, { type: "bip-captured" });
    expect(next).toEqual({ ...homeVisible, surface: "native" });
    expect(viewOf(next)).toEqual({ view: "native" });
  });

  it("snoozes a visible home card for seven days", () => {
    const snoozed = stepCoach(homeVisible, { type: "not-now", now: 5_000 });
    expect(snoozed).toEqual({
      ...homeVisible,
      phase: "resting",
      memory: { kind: "snoozed", until: 5_000 + WEEK_MS },
    });
    expect(viewOf(snoozed)).toEqual({ view: "silent" });
    expect(
      stepCoach(homeVisible, { type: "prompt-dismissed", now: 5_000 }),
    ).toEqual(snoozed);
  });

  it("retires a visible home card", () => {
    const retired = {
      ...homeVisible,
      phase: "resting" as const,
      memory: { kind: "retired" as const },
    };
    expect(stepCoach(homeVisible, { type: "retire" })).toEqual(retired);
    expect(stepCoach(homeVisible, { type: "prompt-accepted" })).toEqual(retired);
    expect(viewOf(retired)).toEqual({ view: "silent" });
  });

  it("turns a failed native prompt into generic steps and stays open", () => {
    const native: CoachState = { ...homeVisible, surface: "native" };
    const failed = stepCoach(native, { type: "prompt-failed" });
    expect(failed).toEqual({ ...native, surface: "generic" });
    expect(viewOf(failed)).toEqual({ view: "generic-steps" });
    expect(stepCoach(homeVisible, { type: "prompt-failed" })).toBe(homeVisible);
  });

  it("opens the profile card and collapses without touching a snooze", () => {
    const row: CoachState = {
      tag: "profile",
      phase: "row",
      surface: "ios",
      memory: { kind: "snoozed", until: 12_345 },
    };
    const open = stepCoach(row, { type: "expand" });
    expect(open).toEqual({ ...row, phase: "open" });
    expect(viewOf(row)).toEqual({ view: "profile-row" });
    expect(viewOf(open)).toEqual({ view: "ios-steps" });
    expect(stepCoach(open, { type: "collapse" })).toEqual(row);
  });

  it("restarts the seven days when profile dismisses again", () => {
    const open: CoachState = {
      tag: "profile",
      phase: "open",
      surface: "generic",
      memory: { kind: "snoozed", until: 100 },
    };
    const row = stepCoach(open, { type: "not-now", now: 50 });
    expect(row).toEqual({
      ...open,
      phase: "row",
      memory: { kind: "snoozed", until: 50 + WEEK_MS },
    });
    const again = stepCoach(stepCoach(row, { type: "expand" }), {
      type: "prompt-dismissed",
      now: 80,
    });
    expect(again).toEqual({
      tag: "profile",
      phase: "row",
      surface: "generic",
      memory: { kind: "snoozed", until: 80 + WEEK_MS },
    });
  });

  it("retires from an open profile card and returns to the row", () => {
    const open: CoachState = {
      tag: "profile",
      phase: "open",
      surface: "native",
      memory: { kind: "open" },
    };
    const retired = {
      tag: "profile" as const,
      phase: "row" as const,
      surface: "native" as const,
      memory: { kind: "retired" as const },
    };
    expect(stepCoach(open, { type: "retire" })).toEqual(retired);
    expect(stepCoach(open, { type: "prompt-accepted" })).toEqual(retired);
    expect(viewOf(retired)).toEqual({ view: "profile-row" });
  });

  it("drops the install path when a profile prompt fails", () => {
    const open: CoachState = {
      tag: "profile",
      phase: "open",
      surface: "native",
      memory: { kind: "open" },
    };
    const failed = stepCoach(open, { type: "prompt-failed" });
    expect(failed).toEqual({ ...open, surface: "generic" });
    expect(viewOf(failed)).toEqual({ view: "generic-steps" });
  });

  it("upgrades a profile row or open card when the prompt arrives", () => {
    const row: CoachState = {
      tag: "profile",
      phase: "row",
      surface: "generic",
      memory: { kind: "open" },
    };
    const nativeRow = stepCoach(row, { type: "bip-captured" });
    expect(nativeRow).toEqual({ ...row, surface: "native" });
    expect(viewOf(nativeRow)).toEqual({ view: "profile-row" });
    const open = stepCoach(nativeRow, { type: "expand" });
    expect(viewOf(open)).toEqual({ view: "native" });
  });

  it("ignores events that do not apply", () => {
    const blank: CoachState = { tag: "blank" };
    const installed: CoachState = { tag: "installed" };
    const resting: CoachState = { ...homeVisible, phase: "resting" };
    expect(stepCoach(blank, { type: "tick", now: 9 })).toBe(blank);
    expect(stepCoach(blank, { type: "became-installed" })).toBe(blank);
    expect(stepCoach(installed, { type: "expand" })).toBe(installed);
    expect(stepCoach(installed, { type: "became-installed" })).toBe(installed);
    expect(viewOf(blank)).toEqual({ view: "silent" });
    expect(viewOf(installed)).toEqual({ view: "silent" });
    expect(viewOf(resting)).toEqual({ view: "silent" });
    expect(stepCoach(resting, { type: "bip-captured" })).toBe(resting);
    expect(stepCoach(resting, { type: "not-now", now: 1 })).toBe(resting);
    const armed = boot({ now: 0 });
    expect(stepCoach(armed, { type: "not-now", now: 0 })).toBe(armed);
    expect(stepCoach(armed, { type: "expand" })).toBe(armed);
    expect(stepCoach(homeVisible, { type: "tick", now: 9_000 })).toBe(homeVisible);
    expect(stepCoach(homeVisible, { type: "collapse" })).toBe(homeVisible);
    const row: CoachState = {
      tag: "profile",
      phase: "row",
      surface: "generic",
      memory: { kind: "open" },
    };
    expect(stepCoach(row, { type: "tick", now: 1 })).toBe(row);
    expect(stepCoach(row, { type: "collapse" })).toBe(row);
    expect(
      stepCoach({ ...homeVisible, tag: "home" }, { type: "became-installed" }),
    ).toEqual({ tag: "installed" });
    expect(stepCoach(row, { type: "became-installed" })).toEqual({
      tag: "installed",
    });
  });
});
