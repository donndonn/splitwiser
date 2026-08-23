"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const subscribe = () => () => {};

export function ThemeSelector() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();

  return (
    <section className="mb-6 space-y-2" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading" className="text-sm font-medium">
          Appearance
        </h2>
        <p className="text-xs text-muted-foreground">
          Choose how Splitwiser looks on this device.
        </p>
      </div>
      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        role="group"
        aria-label="Color theme"
      >
        {options.map((option) => {
          const active = mounted
            ? theme === option.value
            : option.value === "system";
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-70",
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
