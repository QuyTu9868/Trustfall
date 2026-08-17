"use client";

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { targetChain } from "./chain";
import { type Rental, escrowAddress } from "./escrow";
import { scanBack } from "./event-scan";

const RENT_SETTLED = parseAbiItem(
  "event RentSettled(uint256 indexed id, uint256 charged, uint256 toOwner, uint256 fee, uint256 refundedToRenter)"
);

export type Balances = {
  /** Mine, and the contract is still holding it. */
  held: bigint;
  /** Mine, and it has already been paid out to my wallet. */
  released: bigint;
  /** The lending side of the same reading, for somebody who wants to know what they made. */
  earnings: Earnings;
};

/**
 * What lending things out has actually paid, as opposed to what has moved through escrow.
 *
 * Separate from `released` because that figure deliberately mixes renting and lending: it
 * answers "how much of mine is tied up", and a deposit coming back is not income. These
 * numbers answer a different question and must not be added to those.
 *
 * Every field comes from a RentSettled event. `earned` is what the contract paid out, after
 * its own fee, so it is money that arrived rather than money that was quoted.
 */
export type Earnings = {
  /** Sum of toOwner across settled rentals I own. What actually arrived. */
  earned: bigint;
  /** Sum of the contract's own cut on those same rentals. */
  fees: bigint;
  /**
   * How many settlements the figures above were added from.
   *
   * Shown beside them on purpose. The event scan looks back a bounded distance, so a
   * settlement old enough falls out of both this count and that total together, and the two
   * numbers stay consistent with each other rather than one of them quietly going wrong.
   */
  lettings: number;
  /** Rentals I own that have not settled yet. */
  pending: number;
  /**
   * The most those pending rentals can still pay, after the fee.
   *
   * At most, never "will": the contract charges for the days an item is actually kept, so
   * anything short of the full booking settles lower. The listing page already says "owner
   * receives at most" about the same quantity.
   */
  pendingAtMost: bigint;
  /** Earned per listing, keyed by the bytes32 the chain stores. */
  perListing: Map<string, bigint>;
};

/**
 * What the escrow is holding of mine, and what it has already let go.
 *
 * Both numbers are read from the chain rather than added up as transactions happen. A
 * running total kept in the app is a second opinion about somebody's money, and the day
 * it disagrees with the contract there is no way to tell which is right.
 *
 * Renting and lending are added together on purpose. The question this answers is "how
 * much of mine is tied up", and somebody who has one item out and another one in does not
 * think of those as two separate wallets.
 */
/** Mirrors RentalEscrow.FEE_BPS, 1%. Only used for the "at most" figure on unsettled rentals. */
const FEE_BPS = 100n;

const NOTHING: Balances = {
  held: 0n,
  released: 0n,
  earnings: {
    earned: 0n,
    fees: 0n,
    lettings: 0,
    pending: 0,
    pendingAtMost: 0n,
    perListing: new Map(),
  },
};

export function useEscrowBalances(rentals: Rental[]) {
  const config = useConfig();
  const { address } = useAccount();
  const [balances, setBalances] = useState<Balances>(NOTHING);

  const me = address?.toLowerCase();
  // A stable key, so the effect runs when a rental actually changes rather than on every
  // render that happens to rebuild the array.
  const signature = rentals.map((r) => `${r.id}:${r.status}`).join(",");

  useEffect(() => {
    if (!me || !escrowAddress) return;
    let active = true;

    (async () => {
      const client = getPublicClient(config, { chainId: targetChain.id });

      // One request for every settlement, then matched up locally. Asking per rental would
      // be one round trip each, and this page already reads the whole list.
      const settled = new Map<bigint, { toOwner: bigint; fee: bigint; refundedToRenter: bigint }>();
      // Every window, not the first with a hit: this totals a whole history rather than
      // finding one rental, so stopping early would understate it. scanBack never throws,
      // and a window it could not read costs completeness rather than the whole figure.
      const logs = await scanBack(client, { address: escrowAddress, event: RENT_SETTLED });
      for (const log of logs) {
        const args = (
          log as {
            args?: { id?: bigint; toOwner?: bigint; fee?: bigint; refundedToRenter?: bigint };
          }
        ).args;
        if (args?.id === undefined) continue;
        settled.set(args.id, {
          toOwner: args.toOwner as bigint,
          fee: args.fee as bigint,
          refundedToRenter: args.refundedToRenter as bigint,
        });
      }

      let held = 0n;
      let released = 0n;
      const earnings: Earnings = {
        earned: 0n,
        fees: 0n,
        lettings: 0,
        pending: 0,
        pendingAtMost: 0n,
        perListing: new Map(),
      };

      for (const rental of rentals) {
        const isRenter = rental.renter.toLowerCase() === me;
        const money = settled.get(rental.id);

        if (isRenter) {
          switch (rental.status) {
            // Nothing has been worked out yet, so the contract is sitting on all of it.
            case "Requested":
            case "Approved":
            case "Active":
              held += rental.rent + rental.deposit;
              break;
            // The rent was settled on the way out of Active. Only the deposit is left, and
            // it stays put until the dispute window closes.
            case "Returned":
            case "Disputed":
              held += rental.deposit;
              released += money?.refundedToRenter ?? 0n;
              break;
            case "Completed":
              released += rental.deposit + (money?.refundedToRenter ?? 0n);
              break;
            case "Cancelled":
              // Refunds on cancellation vary with when it happened, and the contract is the
              // only place that knows. Counting a guess here would be worse than counting
              // nothing.
              break;
          }
        } else {
          // Lending. An owner never has money held on their behalf: their share arrives
          // when the rent is settled, and before that there is nothing of theirs in there.
          released += money?.toOwner ?? 0n;

          if (money) {
            earnings.earned += money.toOwner;
            earnings.fees += money.fee;
            earnings.lettings += 1;
            const key = rental.listingId;
            earnings.perListing.set(key, (earnings.perListing.get(key) ?? 0n) + money.toOwner);
          } else if (rental.status !== "Cancelled") {
            // Still to come. A cancelled rental pays the owner a penalty rather than rent,
            // and the contract works that out from when it was cancelled, so counting it
            // here would be inventing a number the chain already knows and did not say.
            earnings.pending += 1;
            earnings.pendingAtMost += rental.rent - (rental.rent * FEE_BPS) / 10_000n;
          }
        }
      }

      if (active) setBalances({ held, released, earnings });
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, me, signature]);

  // Zeroed here rather than in the effect. Signing out has to clear the figures, and
  // doing that by setting state inside an effect is both a wasted render and the thing
  // the lint rule is there to stop.
  return me ? balances : NOTHING;
}
