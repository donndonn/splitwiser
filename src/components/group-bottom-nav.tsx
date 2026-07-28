"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, History, Home, Receipt, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "", label: "Home", icon: Home, match: "exact" as const },
  {
    href: "/expenses/new",
    label: "Add",
    icon: Receipt,
    match: "prefix" as const,
  },
  {
    href: "/balances",
    label: "Balances",
    icon: ArrowLeftRight,
    match: "prefix" as const,
  },
  {
    href: "/activity",
    label: "Activity",
    icon: History,
    match: "prefix" as const,
  },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    match: "prefix" as const,
  },
];

export function GroupBottomNav({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const base = `/g/${groupId}`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/90 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const active =
            tab.match === "exact"
              ? pathname === base || pathname === `${base}/`
              : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={href}
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
                <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
