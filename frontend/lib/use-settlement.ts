"use client";

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { targetChain } from "./chain";
import { escrowAddress } from "./escrow";

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
 */
export function useSettlement(rentalId: bigint, enabled: boolean) {
  const config = useConfig();
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  useEffect(() => {
    if (!enabled || !escrowAddress) return;
    let active = true;

    (async () => {
      try {
        const client = getPublicClient(config, { chainId: targetChain.id });
        if (!client) return;
        const logs = await client.getLogs({
          address: escrowAddress,
          event: RENT_SETTLED,
          args: { id: rentalId },
          fromBlock: "earliest",
        });
        const last = logs.at(-1);
        if (active && last?.args) {
          setSettlement({
            charged: last.args.charged as bigint,
            toOwner: last.args.toOwner as bigint,
            fee: last.args.fee as bigint,
            refundedToRenter: last.args.refundedToRenter as bigint,
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
