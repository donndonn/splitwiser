export type AddExpenseGroup = {
  id: string;
  name: string;
};

export type AddExpenseEntry =
  | { type: "direct"; groupId: string }
  | { type: "picker" }
  | { type: "empty" };

/**
 * Groups-list "Add expense" destination.
 * One group skips the picker. None asks the user to create a group first.
 */
export function resolveAddExpenseEntry(
  groups: readonly AddExpenseGroup[],
): AddExpenseEntry {
  if (groups.length === 0) return { type: "empty" };
  const only = groups[0];
  if (groups.length === 1 && only) return { type: "direct", groupId: only.id };
  return { type: "picker" };
}
