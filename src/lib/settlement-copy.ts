/** Display name that reads as “You” for the current member. */
export function memberLabel(
  memberId: string,
  currentMemberId: string,
  displayName: string,
): string {
  return memberId === currentMemberId ? "You" : displayName;
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
