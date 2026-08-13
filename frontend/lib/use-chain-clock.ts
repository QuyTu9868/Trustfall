"use client";

import { useEffect, useState } from "react";
import { useBlock } from "wagmi";
import { targetChain } from "./chain";

/**
 * The chain's clock, which is the only one that decides anything.
 *
 * Every deadline in this app is enforced by the contract against block.timestamp: how long
 * a booking runs, how long a handover code is good for, how long an approval signature
 * lasts, when a deposit can be released. Reading any of those off the browser is measuring
 * with the wrong ruler, and it was wrong here in four separate places before this existed.
 *
 * On a real network the two clocks agree to within seconds and none of it shows. On a
 * local chain wound forward by the dev tools they are days apart, which is why the dev
 * tools are where the problem kept surfacing.
 *
 * The reading is kept in state rather than taken during render: a hook that calls
 * Date.now() while rendering answers a different number every time React asks it the same
 * question, which is the definition of not being pure.
 */
export function useChainNowSeconds() {
  // Thirty seconds, not wagmi's four. Both this and useSecondsLeft ask for the same block,
  // so React Query serves them from one query, and the only question is how often that one
  // query costs a request. A countdown measured in days does not need the answer to the
  // second, and at four seconds this was a fifth of the RPC bill on its own.
  const { data: block } = useBlock({
    chainId: targetChain.id,
    watch: { pollingInterval: 30_000 },
  });
  const chainTime = block?.timestamp;
  const [now, setNow] = useState(0);

  useEffect(() => {
    // The difference between the two clocks, measured once per block, plus local seconds
    // in between. Asking the chain every second would be a request per second per open
    // tab for something that moves at exactly one second per second.
    const offset = chainTime ? Number(chainTime) - Math.floor(Date.now() / 1000) : 0;
    const tick = () => setNow(Math.floor(Date.now() / 1000) + offset);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [chainTime]);

  return now;
}

/**
 * Today's date on the chain, as an input[type=date] wants it.
 *
 * Used as the earliest selectable day, so the picker cannot offer a date the contract will
 * refuse. Being told "RentalAlreadyOver" in Solidity after filling in a form is a worse
 * way to learn a date was wrong than never being offered it.
 */
export function useChainToday() {
  const now = useChainNowSeconds();
  // Zero until the first tick lands, which is one render. Empty rather than falling back
  // to the browser's date: an unset min lets the picker offer anything for a moment, and
  // reading the clock here to avoid that would put an impure call back in a render.
  return now ? new Date(now * 1000).toISOString().slice(0, 10) : undefined;
}
