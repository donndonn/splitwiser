"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GroupHomeExpenseFab,
  groupHomeScrollClearanceClass,
} from "@/components/add-expense-pill";
import { GroupBottomNav } from "@/components/group-bottom-nav";
import { cn } from "@/lib/utils";

/**
 * Viewport column for group tabs.
 *
 * The tab bar used to be `position: fixed; bottom: 0` while the document
 * scrolled. On iOS Safari (including installed PWAs) that anchor is the
 * layout viewport, and a fixed layer with backdrop-filter can freeze at a
 * stale visual-viewport offset after a scroll or after the keyboard / select
 * picker closes. A full reload rebuilds the layer, which is why a restart
 * cleared it. Members is the tall tab with text fields, so it hit the bug
 * first. The bar is now an in-flow footer; only the pane above it scrolls.
 *
 * The Home Add expense pill is absolute on this shell, which is not itself
 * a flex container, so it overlays the pane. It is not a sibling row between
 * the pane and the bar.
 */
export function GroupTabsShell({
  groupId,
  children,
}: {
  groupId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pathnameRef = useRef(pathname);
  const scrollPositions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const previous = pathnameRef.current;
    if (previous !== pathname) {
      scrollPositions.current.set(previous, scroller.scrollTop);
      pathnameRef.current = pathname;
    }

    scroller.scrollTop = scrollPositions.current.get(pathname) ?? 0;
  }, [pathname]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select")) return;

      // The document no longer scrolls, so iOS will not pan a focused field
      // into view on its own. Wait for the keyboard inset, then scroll the pane.
      window.setTimeout(() => {
        if (!scroller.contains(target)) return;
        target.scrollIntoView({ block: "nearest" });
      }, 300);
    };

    scroller.addEventListener("focusin", onFocusIn);
    return () => scroller.removeEventListener("focusin", onFocusIn);
  }, []);

  const base = `/g/${groupId}`;
  const isHome = pathname === base || pathname === `${base}/`;

  return (
    <div
      data-group-tabs=""
      className="relative h-dvh max-h-dvh w-full min-w-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <div
          ref={scrollerRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
            isHome && groupHomeScrollClearanceClass,
          )}
        >
          {children}
        </div>
        <GroupBottomNav groupId={groupId} />
      </div>
      {isHome ? <GroupHomeExpenseFab groupId={groupId} /> : null}
    </div>
  );
}
