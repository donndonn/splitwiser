"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_WIDTH = 80;
/** Ignore tiny jitter until movement clearly picks an axis. */
const ACTIVATE_THRESHOLD = 12;
/** After horizontal lock, treat smaller motion as a tap (still navigate). */
const TAP_SLOP = 8;
const OPEN_RATIO = 0.4;

type SwipeableExpenseRowProps = {
  href: string;
  description: string;
  subtitle: string;
  amountLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteRequest: () => void;
};

export function SwipeableExpenseRow({
  href,
  description,
  subtitle,
  amountLabel,
  open,
  onOpenChange,
  onDeleteRequest,
}: SwipeableExpenseRowProps) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axis = useRef<"undecided" | "horizontal" | "vertical">("undecided");
  const pointerId = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef(0);
  const swiped = useRef(false);
  const suppressClick = useRef(false);

  const displayedOffset = dragging ? offset : open ? -ACTION_WIDTH : 0;

  function snapTo(nextOpen: boolean) {
    const next = nextOpen ? -ACTION_WIDTH : 0;
    offsetRef.current = next;
    setOffset(next);
    onOpenChange(nextOpen);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = open ? -ACTION_WIDTH : 0;
    offsetRef.current = startOffset.current;
    axis.current = "undecided";
    swiped.current = false;
    draggingRef.current = true;
    setOffset(startOffset.current);
    setDragging(true);
    // Do not capture yet — capturing too early breaks taps / Link clicks.
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerId.current !== e.pointerId || !draggingRef.current) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (axis.current === "undecided") {
      if (
        Math.abs(dx) < ACTIVATE_THRESHOLD &&
        Math.abs(dy) < ACTIVATE_THRESHOLD
      ) {
        return;
      }
      if (Math.abs(dy) > Math.abs(dx)) {
        axis.current = "vertical";
        draggingRef.current = false;
        setDragging(false);
        pointerId.current = null;
        return;
      }
      axis.current = "horizontal";
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    if (axis.current !== "horizontal") return;

    e.preventDefault();
    const next = Math.min(0, Math.max(-ACTION_WIDTH, startOffset.current + dx));
    offsetRef.current = next;
    setOffset(next);

    if (Math.abs(next - startOffset.current) > TAP_SLOP) {
      swiped.current = true;
    }
  }

  function endDrag(
    e: React.PointerEvent<HTMLDivElement>,
    { allowNavigate }: { allowNavigate: boolean },
  ) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }

    if (!draggingRef.current && axis.current !== "horizontal") {
      return;
    }

    const wasHorizontal = axis.current === "horizontal";
    const didSwipe = swiped.current;
    draggingRef.current = false;
    setDragging(false);
    axis.current = "undecided";

    if (!wasHorizontal) {
      offsetRef.current = open ? -ACTION_WIDTH : 0;
      setOffset(offsetRef.current);

      // Pure tap: navigate ourselves. Relying on Link click alone fails when
      // the browser treats the press as a gesture (common on touch).
      // Skip on pointercancel — that often fires during scroll.
      if (!allowNavigate) return;
      suppressClick.current = true;
      if (open) {
        snapTo(false);
      } else {
        router.push(href);
      }
      return;
    }

    if (didSwipe) {
      suppressClick.current = true;
      const shouldOpen = Math.abs(offsetRef.current) > ACTION_WIDTH * OPEN_RATIO;
      snapTo(shouldOpen);
      return;
    }

    // Horizontal jitter within tap slop — treat as tap.
    offsetRef.current = open ? -ACTION_WIDTH : 0;
    setOffset(offsetRef.current);
    if (!allowNavigate) return;
    suppressClick.current = true;
    if (open) {
      snapTo(false);
    } else {
      router.push(href);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex w-20 items-stretch"
        aria-hidden={!open && displayedOffset === 0}
      >
        <button
          type="button"
          className="flex w-full flex-col items-center justify-center gap-1 bg-destructive text-destructive-foreground"
          onClick={() => {
            onDeleteRequest();
          }}
          tabIndex={open ? 0 : -1}
        >
          <Trash2 className="size-4" />
          <span className="text-xs font-medium">Delete</span>
        </button>
      </div>

      <div
        className={cn(
          "relative touch-pan-y bg-card transition-transform duration-200 ease-out motion-reduce:transition-none",
          dragging && "transition-none",
        )}
        style={{ transform: `translate3d(${displayedOffset}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, { allowNavigate: true })}
        onPointerCancel={(e) => endDrag(e, { allowNavigate: false })}
      >
        <Link
          href={href}
          className="block transition-colors hover:bg-muted/40"
          onClick={(e) => {
            // Prefer pointerup navigation; block duplicate / accidental clicks.
            if (suppressClick.current || open || swiped.current) {
              e.preventDefault();
              suppressClick.current = false;
              if (open && !swiped.current) snapTo(false);
            }
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{description}</p>
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium">{amountLabel}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
