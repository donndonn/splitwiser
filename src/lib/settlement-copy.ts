/** Display name that reads as “You” for the current member. */
export function memberLabel(
  memberId: string,
  currentMemberId: string,
  displayName: string,
): string {
  return memberId === currentMemberId ? "You" : displayName;
}

export type SettlementSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

/**
 * Which member row should show Record for this transfer: the other person
 * when you are involved, otherwise the payer.
 */
export function rowIdForSuggestion(
  suggestion: SettlementSuggestion,
  currentMemberId: string,
): string {
  if (suggestion.fromMemberId === currentMemberId) {
    return suggestion.toMemberId;
  }
  if (suggestion.toMemberId === currentMemberId) {
    return suggestion.fromMemberId;
  }
  return suggestion.fromMemberId;
}

/**
 * Sentence fragment for a suggested transfer, e.g.
 * “You pay Alex”, “Alex pays you”, “Alex pays Sam”.
 */
export function paymentActionLabel(
  fromMemberId: string,
  toMemberId: string,
  currentMemberId: string,
  fromName: string,
  toName: string,
): string {
  const from = memberLabel(fromMemberId, currentMemberId, fromName);
  const to = memberLabel(toMemberId, currentMemberId, toName);
  const verb = fromMemberId === currentMemberId ? "pay" : "pays";
  return `${from} ${verb} ${to}`;
}
