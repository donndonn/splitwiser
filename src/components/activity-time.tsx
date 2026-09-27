"use client";

import { format, isToday, isYesterday } from "date-fns";

/**
 * Absolute time in the viewer's own time zone ("Today at 13:50",
 * "Jan 5 at 22:03"). Rendered on the client because the server's zone is UTC.
 */
export function ActivityTime({ at }: { at: string }) {
  const date = new Date(at);
  const time = format(date, "p");
  const day = isToday(date)
    ? "Today"
    : isYesterday(date)
      ? "Yesterday"
      : format(
          date,
          date.getFullYear() === new Date().getFullYear()
            ? "MMM d"
            : "MMM d, yyyy",
        );

  return (
    <time dateTime={at} suppressHydrationWarning>
      {`${day} at ${time}`}
    </time>
  );
}
