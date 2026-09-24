import { describe, expect, it } from "vitest";
import {
  aggregateFriendNets,
  breakdownBySharedGroup,
  friendBalancePhrase,
} from "./friend-balances";

const alice = { memberId: "m-alice", userId: "alice" };
const bob = { memberId: "m-bob", userId: "bob" };
const cara = { memberId: "m-cara", userId: "cara" };

describe("aggregateFriendNets", () => {
  it("credits the viewer when a friend is suggested to pay them", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: 1000 },
            { memberId: "m-bob", netCents: -1000 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([{ currency: "USD", netCents: 1000 }]);
  });

  it("debits the viewer when they are suggested to pay a friend", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: -2500 },
            { memberId: "m-bob", netCents: 2500 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([{ currency: "USD", netCents: -2500 }]);
  });

  it("sums shared groups in one currency and keeps others apart", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: 400 },
            { memberId: "m-bob", netCents: -400 },
          ],
        },
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: -150 },
            { memberId: "m-bob", netCents: 150 },
          ],
        },
        {
          currency: "EUR",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: 80 },
            { memberId: "m-bob", netCents: -80 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([
      { currency: "EUR", netCents: 80 },
      { currency: "USD", netCents: 250 },
    ]);
  });

  it("drops a pair that simplifies to zero across groups", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: 1000 },
            { memberId: "m-bob", netCents: -1000 },
          ],
        },
        {
          currency: "USD",
          members: [alice, bob],
          balances: [
            { memberId: "m-alice", netCents: -1000 },
            { memberId: "m-bob", netCents: 1000 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([]);
  });

  it("ignores debts simplified to someone other than the friend", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob, cara],
          balances: [
            { memberId: "m-alice", netCents: -3000 },
            { memberId: "m-bob", netCents: 0 },
            { memberId: "m-cara", netCents: 3000 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([]);
  });

  it("counts only the slice of a settlement that reaches the friend", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob", "cara"],
      groups: [
        {
          currency: "USD",
          members: [alice, bob, cara],
          balances: [
            { memberId: "m-alice", netCents: -3000 },
            { memberId: "m-cara", netCents: 2000 },
            { memberId: "m-bob", netCents: 1000 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([{ currency: "USD", netCents: -1000 }]);
    expect(nets.get("cara")).toEqual([{ currency: "USD", netCents: -2000 }]);
  });

  it("ignores placeholder members and groups the viewer is not in", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob"],
      groups: [
        {
          currency: "USD",
          members: [alice, { memberId: "m-guest", userId: null }],
          balances: [
            { memberId: "m-alice", netCents: 500 },
            { memberId: "m-guest", netCents: -500 },
          ],
        },
        {
          currency: "USD",
          members: [bob, cara],
          balances: [
            { memberId: "m-bob", netCents: -900 },
            { memberId: "m-cara", netCents: 900 },
          ],
        },
      ],
    });

    expect(nets.get("bob")).toEqual([]);
  });

  it("returns an empty list when friends share no balance", () => {
    const nets = aggregateFriendNets({
      viewerUserId: "alice",
      friendUserIds: ["bob", "cara"],
      groups: [],
    });

    expect(nets.get("bob")).toEqual([]);
    expect(nets.get("cara")).toEqual([]);
    expect(nets.has("alice")).toBe(false);
  });
});

describe("friendBalancePhrase", () => {
  it("says owes you when the friend should pay", () => {
    expect(friendBalancePhrase({ currency: "USD", netCents: 1050 })).toBe(
      "owes you $10.50",
    );
  });

  it("says you owe when the viewer should pay", () => {
    expect(friendBalancePhrase({ currency: "EUR", netCents: -200 })).toBe(
      "you owe €2.00",
    );
  });

  it("says settled at zero", () => {
    expect(friendBalancePhrase({ currency: "USD", netCents: 0 })).toBe(
      "settled",
    );
  });
});

describe("breakdownBySharedGroup", () => {
  it("keeps every shared group and its pairwise balance", () => {
    const groups = [
      {
        groupId: "trip",
        groupName: "Trip",
        currency: "USD",
        members: [alice, bob],
        balances: [
          { memberId: alice.memberId, netCents: 1200 },
          { memberId: bob.memberId, netCents: -1200 },
        ],
      },
      {
        groupId: "dinner",
        groupName: "Dinner",
        currency: "USD",
        members: [alice, bob],
        balances: [
          { memberId: alice.memberId, netCents: -500 },
          { memberId: bob.memberId, netCents: 500 },
        ],
      },
      {
        groupId: "settled",
        groupName: "Old trip",
        currency: "EUR",
        members: [alice, bob],
        balances: [],
      },
      {
        groupId: "other-debt",
        groupName: "House",
        currency: "USD",
        members: [alice, bob, cara],
        balances: [
          { memberId: alice.memberId, netCents: -300 },
          { memberId: bob.memberId, netCents: 0 },
          { memberId: cara.memberId, netCents: 300 },
        ],
      },
    ];

    const breakdown = breakdownBySharedGroup({
      viewerUserId: "alice",
      friendUserId: "bob",
      groups,
    });

    expect(breakdown).toEqual([
      { groupId: "trip", groupName: "Trip", currency: "USD", netCents: 1200 },
      { groupId: "dinner", groupName: "Dinner", currency: "USD", netCents: -500 },
      { groupId: "settled", groupName: "Old trip", currency: "EUR", netCents: 0 },
      { groupId: "other-debt", groupName: "House", currency: "USD", netCents: 0 },
    ]);
    expect(breakdown.reduce((sum, group) => sum + group.netCents, 0)).toBe(
      700,
    );
    expect(
      aggregateFriendNets({
        viewerUserId: "alice",
        friendUserIds: ["bob"],
        groups,
      }).get("bob"),
    ).toEqual([{ currency: "USD", netCents: 700 }]);
  });
});
