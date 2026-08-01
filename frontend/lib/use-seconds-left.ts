"use client";

import { useEffect, useState } from "react";

/**
 * Seconds remaining until a timestamp, recomputed every second.
 *
 * The clock lives in state rather than being read during render, because reading
 * Date.now() while rendering gives React a component that returns something different
 * every time it is called with the same props. Two places need this number - the
 * countdown and the button it unlocks - and they have to agree, so they share one hook
 * instead of each keeping their own clock.
 */
export function useSecondsLeft(target: bigint) {
  const [left, setLeft] = useState(() => secondsUntil(target));

  useEffect(() => {
    const tick = () => setLeft(secondsUntil(target));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return left;
}

function secondsUntil(target: bigint) {
  return Math.max(0, Number(target) - Math.floor(Date.now() / 1000));
}
