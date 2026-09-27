"use client";

import { usePathname } from "next/navigation";
import { ArrowLeftRight, History, Home, Users } from "lucide-react";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export function GroupBottomNav({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const base = `/g/${groupId}`;

  return (
    <BottomTabBar
      label="Group navigation"
      className="shrink-0"
      tabs={[
        {
          href: base,
          label: "Home",
          icon: Home,
          active: pathname === base || pathname === `${base}/`,
        },
        {
          href: `${base}/balances`,
          label: "Balances",
          icon: ArrowLeftRight,
          active: pathname.startsWith(`${base}/balances`),
        },
        {
          href: `${base}/activity`,
          label: "Activity",
          icon: History,
          active: pathname.startsWith(`${base}/activity`),
        },
        {
          href: `${base}/members`,
          label: "Members",
          icon: Users,
          active: pathname.startsWith(`${base}/members`),
        },
      ]}
    />
  );
}
