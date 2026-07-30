"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { targetChain } from "./chain";

/**
 * Call ensureReady() immediately before any transaction.
 *
 * There is no warning banner and no wall across the app: browsing needs neither a wallet
 * nor the right network, so nagging about it would only get in the way. The chain is
 * fixed at the moment it actually matters, which is when someone presses a button that
 * spends money.
 *
 * Switching still opens a confirm prompt in a browser wallet, that is the wallet's rule
 * and no app can skip it. Privy's embedded wallet switches silently, so email users
 * never see it.
 *
 * Every write goes through here so the login check, the chain switch and the rejection
 * message exist once rather than once per button.
 */
export function useNetworkReady() {
  const { ready: privyReady, authenticated, login } = usePrivy();
  const { chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTargetChain = chain?.id === targetChain.id;

  const ensureReady = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (!privyReady) return false;

    if (!authenticated) {
      // Opens the Privy modal. The user has to press their button again afterwards,
      // rather than us firing a transaction they did not expect at the end of a login.
      login();
      return false;
    }

    if (chain?.id === targetChain.id) return true;

    setSwitching(true);
    try {
      await switchChainAsync({ chainId: targetChain.id });
      return true;
    } catch (cause) {
      // Never swallow this. A button that quietly resets tells the user nothing.
      const message =
        cause instanceof Error && "shortMessage" in cause
          ? String((cause as { shortMessage: unknown }).shortMessage)
          : cause instanceof Error
            ? cause.message
            : "Could not switch network";
      setError(message);
      return false;
    } finally {
      setSwitching(false);
    }
  }, [authenticated, chain?.id, login, privyReady, switchChainAsync]);

  return {
    ensureReady,
    /** True when a transaction can be sent right now with no further steps. */
    ready: privyReady && authenticated && onTargetChain,
    authenticated,
    onTargetChain,
    switching,
    error,
    clearError: () => setError(null),
  };
}
