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
export function useEscrowBalances(rentals: Rental[]) {
  const config = useConfig();
  const { address } = useAccount();
  const [balances, setBalances] = useState<Balances>({ held: 0n, released: 0n });

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
      const settled = new Map<bigint, { toOwner: bigint; refundedToRenter: bigint }>();
      // Every window, not the first with a hit: this totals a whole history rather than
      // finding one rental, so stopping early would understate it. scanBack never throws,
      // and a window it could not read costs completeness rather than the whole figure.
      const logs = await scanBack(client, { address: escrowAddress, event: RENT_SETTLED });
      for (const log of logs) {
        const args = (log as { args?: { id?: bigint; toOwner?: bigint; refundedToRenter?: bigint } })
          .args;
        if (args?.id === undefined) continue;
        settled.set(args.id, {
          toOwner: args.toOwner as bigint,
          refundedToRenter: args.refundedToRenter as bigint,
        });
      }

      let held = 0n;
      let released = 0n;

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
        }
      }

      if (active) setBalances({ held, released });
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, me, signature]);

  // Zeroed here rather than in the effect. Signing out has to clear the figures, and
  // doing that by setting state inside an effect is both a wasted render and the thing
  // the lint rule is there to stop.
  return me ? balances : { held: 0n, released: 0n };
}
