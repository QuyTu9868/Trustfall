"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";

/**
 * Asks the faucet once, quietly, the first time somebody signs in.
 *
 * Renders nothing until it has something to say, and what it says is short lived. A person
 * who has just connected a wallet is looking at the listings, not at a banner explaining
 * where their test money came from, and the balance in the header will show it anyway.
 *
 * The server decides whether to mint. This only asks: sending the amount from here would
 * make the browser the authority on how much test money it gets.
 */
export function UsdcTopUp() {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [amount, setAmount] = useState<string | null>(null);
  // Once per page, not once per render. Without this, a token arriving a moment after
  // authentication would fire a second request while the first was still mining.
  const asked = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || asked.current) return;
    asked.current = true;

    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/faucet", {
          method: "POST",
          headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        });
        if (!response.ok || !active) return;
        const result = await response.json();
        if (result.minted) setAmount(result.amount);
      } catch {
        // Silent on purpose. Nobody asked for this, so nobody needs to be told it failed;
        // the mint button on /dev is still there for anybody who notices they are short.
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authenticated, identityToken]);

  useEffect(() => {
    if (!amount) return;
    const timer = setTimeout(() => setAmount(null), 8000);
    return () => clearTimeout(timer);
  }, [amount]);

  if (!amount) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-card border border-line bg-surface px-4 py-3 text-sm shadow-sm">
      <span className="tabular">{Number(amount).toLocaleString()}</span> test USDC is in your
      wallet. It is a token this demo prints, not money.
    </div>
  );
}
