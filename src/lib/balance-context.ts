import { suggestSettlements } from "@/lib/money";

export type MemberNet = {
  memberId: string;
  netCents: number;
};

export type ViewerBalanceContext = {
  /** Other members with a suggested payment to the viewer. */
  peopleOweYou: number;
  /** Other members the viewer has a suggested payment to. */
  youOwePeople: number;
  everyoneSettled: boolean;
};

/**
 * Counts come from the same net-balance settlement suggestions as Balances.
 * A person is only on one side of those suggestions, so both counts are
 * non-zero only if a future suggestion set includes both directions.
 */
export function viewerBalanceContext(
  viewerMemberId: string,
  balances: MemberNet[],
): ViewerBalanceContext {
  const peopleOweYou = new Set<string>();
  const youOwePeople = new Set<string>();

  for (const transfer of suggestSettlements(balances)) {
    if (transfer.amountCents <= 0) continue;
    if (transfer.toMemberId === viewerMemberId) {
      peopleOweYou.add(transfer.fromMemberId);
    } else if (transfer.fromMemberId === viewerMemberId) {
      youOwePeople.add(transfer.toMemberId);
    }
  }

  return {
    peopleOweYou: peopleOweYou.size,
    youOwePeople: youOwePeople.size,
    everyoneSettled: balances.every((row) => row.netCents === 0),
  };
}

function personWord(count: number) {
  return count === 1 ? "person" : "people";
}

/** Short subtitle under the viewer's group balance. */
export function formatBalanceContext(context: ViewerBalanceContext): string {
  const parts: string[] = [];
  if (context.peopleOweYou > 0) {
    const count = context.peopleOweYou;
    parts.push(
      `${count} ${personWord(count)} ${count === 1 ? "owes" : "owe"} you`,
    );
  }
  if (context.youOwePeople > 0) {
    const count = context.youOwePeople;
    parts.push(`You owe ${count} ${personWord(count)}`);
  }
  if (parts.length > 0) return parts.join(" · ");
  return context.everyoneSettled ? "All settled" : "You're settled up";
}
