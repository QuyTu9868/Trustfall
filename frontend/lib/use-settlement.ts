"use client";

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { targetChain } from "./chain";
import { escrowAddress } from "./escrow";
import { scanBack } from "./event-scan";

const RENT_SETTLED = parseAbiItem(
  "event RentSettled(uint256 indexed id, uint256 charged, uint256 toOwner, uint256 fee, uint256 refundedToRenter)"
);

export type Settlement = {
  charged: bigint;
  toOwner: bigint;
  fee: bigint;
  refundedToRenter: bigint;
};

/**
 * What the rent actually came to, read from the event the contract emitted.
 *
 * Not recomputed here. The frontend already carries the day rate and the timestamps and
 * could do the arithmetic itself, but then two places would decide what somebody was
 * charged, and the day they disagree the screen would be lying about money. The chain
 * did the maths; this reads the answer.
 *
 * Read through scanBack rather than in one request. `fromBlock: "earliest"` is what this
 * wants and no free RPC plan will serve it: see lib/event-scan.ts for what that cost.
 */
export function useSettlement(rentalId: bigint, enabled: boolean) {
  const config = useConfig();
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  useEffect(() => {
    if (!enabled || !escrowAddress) return;
    let active = true;

    (async () => {
      try {
        const logs = await scanBack(getPublicClient(config, { chainId: targetChain.id }), {
          address: escrowAddress,
          event: RENT_SETTLED,
          args: { id: rentalId },
          // One rental settles once, so the first window that has anything has all of it.
          stopOnFirst: true,
        });
        const last = logs.at(-1) as { args?: Settlement } | undefined;
        if (active && last?.args) {
          setSettlement({
            charged: last.args.charged,
            toOwner: last.args.toOwner,
            fee: last.args.fee,
            refundedToRenter: last.args.refundedToRenter,
          });
        }
      } catch {
        // A missing settlement is not an error worth shouting about: the card simply
        // shows nothing extra, which is correct before the item comes back.
      }
    })();

    return () => {
      active = false;
    };
  }, [config, rentalId, enabled]);

  return settlement;
}
