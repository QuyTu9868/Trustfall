"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { isAdminRoute } from "./site-chrome";

/**
 * Keeps the wallet you sign with and the wallet you are signed in as from drifting apart.
 *
 * Two different things answer "who am I" here. Buttons that send transactions use the
 * wallet MetaMask currently has selected. Everything that talks to an API route is
 * identified by the Privy session token, which was fixed at login. Switch accounts inside
 * the extension and only the first one changes.
 *
 * What that looked like before this existed: the header showed the new address while the
 * chat, the bell and the unread badges all quietly belonged to the old one. Messages
 * addressed to the visible wallet did not appear, and opening a thread marked it read for
 * somebody else.
 *
 * The fix is not a wall. Switching wallets reloads the page and ends the session, which
 * puts the app in the one state that cannot be wrong: signed out. Signing in again is a
 * click, and until then nothing on screen claims to belong to anybody.
 *
 * Reloading alone would not do. The Privy session survives a reload, so the two answers
 * would still disagree, only now with no sign that anything had happened.
 */
export function IdentityGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { address, connector } = useAccount();
  // /admin has no wallet on it, so there are no two answers to reconcile. Left running, the
  // reload below would throw somebody out of the log the moment they switched accounts in
  // an extension they were not using.
  const admin = isAdminRoute(usePathname());

  // A switch inside the extension does not remount anything, and stale React state after
  // one is exactly how the wrong address ends up on screen.
  useEffect(() => {
    type Listener = (accounts: string[]) => void;
    type Injected = {
      on?: (event: string, handler: Listener) => void;
      removeListener?: (event: string, handler: Listener) => void;
    };
    if (admin) return;
    const provider = (window as { ethereum?: Injected }).ethereum;
    if (!provider?.on) return;

    const reload = () => window.location.reload();
    provider.on("accountsChanged", reload);
    return () => provider.removeListener?.("accountsChanged", reload);
  }, [connector, admin]);

  const sessionWallet = user?.wallet?.address?.toLowerCase();
  const connected = address?.toLowerCase();

  useEffect(() => {
    if (admin || !ready || !authenticated || !sessionWallet || !connected) return;
    if (sessionWallet === connected) return;
    // Ends the session rather than asking. There is no safe guess about which of the two
    // wallets was meant, and carrying on with either would sign as one and record as the
    // other. No loop to worry about: logging out clears authenticated, so this stops.
    void logout();
  }, [admin, ready, authenticated, sessionWallet, connected, logout]);

  return <>{children}</>;
}
