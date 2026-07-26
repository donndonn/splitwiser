"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Home, Receipt, Users } from "lucide-react";
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const active =
            tab.match === "exact"
              ? pathname === base || pathname === `${base}/`
              : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2.5 text-xs transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
