import type { RecurrenceFrequency } from "@/db/schema";

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];

export type RepeatChoice = RecurrenceFrequency | "never";

export const REPEAT_OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: "never", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

/** Most occurrences one run creates per schedule, so a start date far in the
 * past cannot flood a group in one go; the next run continues. */
export const MAX_OCCURRENCES_PER_RUN = 60;

export function parseRepeatChoice(value: unknown): RepeatChoice {
  const raw = value == null || value === "" ? "never" : String(value);
  if (raw === "never") return "never";
  if (RECURRENCE_FREQUENCIES.includes(raw as RecurrenceFrequency)) {
    return raw as RecurrenceFrequency;
  }
  throw new Error("Invalid repeat option");
}

export function frequencyLabel(frequency: RecurrenceFrequency): string {
  switch (frequency) {
    case "weekly":
      return "every week";
    case "biweekly":
      return "every 2 weeks";
    case "monthly":
      return "every month";
    case "yearly":
      return "every year";
  }
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonths(start: Date, months: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const day = Math.min(
    start.getUTCDate(),
    daysInUtcMonth(year + Math.floor(month / 12), ((month % 12) + 12) % 12),
  );
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Date of occurrence `index` (0 is the first). Always computed from the start
 * so a month-end start keeps its anchor: Jan 31 → Feb 28 → Mar 31.
 */
export function occurrenceDate(
  startsAt: Date,
  frequency: RecurrenceFrequency,
  index: number,
): Date {
  switch (frequency) {
    case "weekly":
      return new Date(startsAt.getTime() + index * 7 * DAY_MS);
    case "biweekly":
      return new Date(startsAt.getTime() + index * 14 * DAY_MS);
    case "monthly":
      return addUtcMonths(startsAt, index);
    case "yearly":
      return addUtcMonths(startsAt, index * 12);
  }
}

/** Occurrence indexes at or before `now` that have not been created yet. */
export function dueOccurrences(input: {
  startsAt: Date;
  frequency: RecurrenceFrequency;
  occurrenceCount: number;
  now: Date;
  limit?: number;
}): { index: number; date: Date }[] {
  const limit = input.limit ?? MAX_OCCURRENCES_PER_RUN;
  const due: { index: number; date: Date }[] = [];
  for (let index = input.occurrenceCount; due.length < limit; index++) {
    const date = occurrenceDate(input.startsAt, input.frequency, index);
    if (date.getTime() > input.now.getTime()) break;
    due.push({ index, date });
  }
  return due;
}
