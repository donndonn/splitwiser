export function allowsDestructive(sql: string): boolean;
export function destructiveFindings(sql: string): string[];
export function formatDestructiveError(
  tag: string,
  findings: readonly string[],
): string;
export function pendingJournalEntries<T extends { when: number }>(
  entries: readonly T[],
  lastCreatedAt: number | null,
): T[];
