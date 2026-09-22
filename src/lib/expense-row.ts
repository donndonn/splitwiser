export type ViewerExpenseShare =
  | { kind: "borrowed"; amountCents: number }
  | { kind: "lent"; amountCents: number }
  | { kind: "settled" }
  | { kind: "none" };

/**
 * The viewer's stake in one expense, from that expense's split only.
 * Lent is what others owe back when the viewer paid. Borrowed is the
 * viewer's own split when someone else paid.
 */
export function viewerExpenseShare(input: {
  amountCents: number;
  paidByViewer: boolean;
  viewerShareCents: number;
}): ViewerExpenseShare {
  const total = Math.max(0, input.amountCents);
  const share = Math.max(0, input.viewerShareCents);

  if (input.paidByViewer) {
    const lent = total - share;
    if (lent > 0) return { kind: "lent", amountCents: lent };
    return { kind: "settled" };
  }

  if (share > 0) return { kind: "borrowed", amountCents: share };
  return { kind: "none" };
}
