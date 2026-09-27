"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BottomTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

/**
 * The four-tab bar shared by the app (Groups, Friends, Activity, Profile) and
 * group (Home, Balances, Activity, Members) navigation, so both look and
 * behave the same. Callers decide positioning via `className`.
 */
export function BottomTabBar({
  tabs,
  label,
  className,
}: {
  tabs: BottomTab[];
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "border-t border-border/60 bg-card pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[var(--tab-bar-height)] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-2 text-[10px] font-medium transition-colors",
                  tab.active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.active && (
                  <span className="absolute top-1 h-1 w-5 rounded-full bg-primary" />
                )}
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={tab.active ? 2.4 : 1.8}
                />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
