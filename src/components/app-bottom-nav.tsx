"use client";

import { usePathname } from "next/navigation";
import { CircleUserRound, History, Users, WalletCards } from "lucide-react";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <BottomTabBar
      label="App navigation"
      className="fixed inset-x-0 bottom-0 z-40"
      tabs={[
        {
          href: "/",
          label: "Groups",
          icon: WalletCards,
          active: pathname === "/",
        },
        {
          href: "/friends",
          label: "Friends",
          icon: Users,
          active: pathname.startsWith("/friends"),
        },
        {
          href: "/activity",
          label: "Activity",
          icon: History,
          active: pathname.startsWith("/activity"),
        },
        {
          href: "/profile",
          label: "Profile",
          icon: CircleUserRound,
          active: pathname.startsWith("/profile"),
        },
      ]}
    />
  );
}
