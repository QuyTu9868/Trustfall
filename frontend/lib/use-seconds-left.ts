"use client";

import { useEffect, useState } from "react";
import { useBlock } from "wagmi";
import { targetChain } from "./chain";

/**
 * Seconds remaining until a chain timestamp, counted on the chain's clock.
 *
 * The obvious version subtracts Date.now(), and it is wrong. Every deadline in the
 * contract is compared against block.timestamp, so a countdown run off the browser clock
 * is measuring a different clock from the one that decides. Two ways that bites: a
 * machine whose time is off shows a number nobody else agrees with, and skipping the
 * local chain forward three days leaves the countdown sitting exactly where it was.
 *
 * So the offset between the two clocks is measured from the latest block and the local
 * clock only fills in the seconds between blocks. Wagmi's block query is shared, so the
 * countdown and the button it unlocks read one clock rather than two.
 */
export function useSecondsLeft(target: bigint) {
  // Thirty seconds, not wagmi's four. Both this and useSecondsLeft ask for the same block,
  // so React Query serves them from one query, and the only question is how often that one
  // query costs a request. A countdown measured in days does not need the answer to the
  // second, and at four seconds this was a fifth of the RPC bill on its own.
  const { data: block } = useBlock({
    chainId: targetChain.id,
    watch: { pollingInterval: 30_000 },
  });

  // Starting at zero would mean "the deadline has passed" for the one render before the
  // effect runs, which is long enough to light up a Release the deposit button that
  // should be dark. The browser clock is a good enough first guess until the block lands.
  const [left, setLeft] = useState(() => Math.max(0, Number(target) - Math.floor(Date.now() / 1000)));
  const chainTime = block?.timestamp;

  // Reading the clock belongs in here rather than in the render body. A component that
  // calls Date.now() while rendering returns something different every time React asks
  // it the same question, which is the definition of not being pure.
  useEffect(() => {
    const offset = chainTime ? Number(chainTime) - Math.floor(Date.now() / 1000) : 0;
    const tick = () =>
      setLeft(Math.max(0, Number(target) - (Math.floor(Date.now() / 1000) + offset)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target, chainTime]);

  return left;
}
