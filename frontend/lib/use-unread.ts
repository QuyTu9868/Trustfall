"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

const POLL_MS = 10000;

export type Unread = { counts: Record<string, number>; total: number };

/**
 * Unread message counts, one number per conversation plus a total.
 *
 * Three places show this: the header link, the thread list on the inbox, and the button
 * on a rental card. They must agree, so they read one hook rather than three copies of
 * the same fetch that would each be a few seconds out of step with the others.
 *
 * The counts are kept with the wallet they were fetched for. Switching accounts otherwise
 * leaves the previous person's badge sitting on screen until the next poll lands.
 */
export function useUnread() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const [loaded, setLoaded] = useState<{ owner?: string; data: Unread }>({
    data: { counts: {}, total: 0 },
  });

  useEffect(() => {
    if (!authenticated || !address) return;
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/messages/unread");
        if (!response.ok) return;
        const result = (await response.json()) as Unread;
        if (active) setLoaded({ owner: address, data: result });
      } catch {
        // A missed poll just means the badge is a few seconds stale.
      }
    };

    void load();
    // Nothing while the tab is hidden. A bare setInterval keeps firing behind another
    // window, on a minimised browser, and with the lid shut, and each of these polls makes
    // the server read the contract on its behalf. Measured at roughly 35,000 chain reads a
    // day from one rental page nobody was looking at.
    //
    // Firing on visibilitychange as well, so coming back to the window refreshes it at once
    // rather than up to one interval later. That was the reason background polling got
    // turned on in the first place, and this buys it for nothing.
    const tick = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [authenticated, address]);

  return loaded.owner === address ? loaded.data : { counts: {}, total: 0 };
}

