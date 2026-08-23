"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Users, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/",
    label: "Groups",
    icon: WalletCards,
    match: "exact" as const,
  },
  {
    href: "/friends",
    label: "Friends",
    icon: Users,
    match: "prefix" as const,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: CircleUserRound,
    match: "prefix" as const,
  },
];

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="App navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1">
        {tabs.map((tab) => {
          const active =
            tab.match === "exact"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-2 text-[10px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute top-1 h-1 w-5 rounded-full bg-primary" />
                )}
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={active ? 2.4 : 1.8}
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
