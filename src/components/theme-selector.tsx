"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { settingsLabelClass, settingsRowClass } from "@/components/settings-list";
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
    <div className={cn(settingsRowClass, "py-2 pr-2")}>
      <span id="appearance-label" className={settingsLabelClass}>
        Appearance
      </span>
      <div
        className="ml-auto grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5"
        role="group"
        aria-labelledby="appearance-label"
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
                "inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-70",
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
