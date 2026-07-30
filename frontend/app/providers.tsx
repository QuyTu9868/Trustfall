"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { supportedChains, targetChain } from "@/lib/chain";
import { wagmiConfig } from "@/lib/wagmi";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session, not one per render.
  const [queryClient] = useState(() => new QueryClient());

  // Without an app id Privy throws on mount and the page goes blank, which is a
  // miserable way to find out one env var is missing. Say what is wrong instead.
  if (!appId) return <MissingPrivyAppId />;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Email gives you an embedded wallet, wallet is the browser extension path.
        // Both live in the same modal, so there is only ever one way in.
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: targetChain,
        supportedChains: [...supportedChains],
        appearance: {
          theme: "light",
          accentColor: "#111111",
          landingHeader: "Sign in to Trustfall",
          loginMessage: "Rent real things with on-chain escrow.",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function MissingPrivyAppId() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="text-2xl">Missing Privy app id</h1>
      <p className="text-sm text-ink-muted">
        Sign in needs one environment variable. Paste your app id from the Privy
        dashboard into <code className="tabular">frontend/.env.local</code>, then restart
        the dev server.
      </p>
      <pre className="overflow-x-auto rounded-card border border-line bg-surface p-3 text-xs">
        NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
      </pre>
    </main>
  );
}
