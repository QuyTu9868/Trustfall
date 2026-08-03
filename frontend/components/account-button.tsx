"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useAccount } from "wagmi";
import { targetChain } from "@/lib/chain";

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AccountButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chain } = useAccount();
  const [open, setOpen] = useState(false);

  // Privy takes a moment to report in. Show the real button disabled rather than an
  // empty outlined box, which reads as a broken input rather than a loading state.
  if (!ready) {
    return (
      <button
        disabled
        className="h-9 rounded-control bg-ink-strong px-4 text-sm text-canvas opacity-40"
      >
        Sign in
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="h-9 rounded-control bg-ink-strong px-4 text-sm text-canvas active:scale-[0.98]"
      >
        Sign in
      </button>
    );
  }

  const email = user?.email?.address;
  const label = address ? shorten(address) : (email ?? "Account");
  const offTarget = chain !== undefined && chain.id !== targetChain.id;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm"
      >
        {/* A quiet dot, not a warning banner. Being on the wrong chain is fixed at
            transaction time, so this only has to say where you are. */}
        <span
          className={`size-1.5 rounded-full ${offTarget ? "bg-stop-ink" : "bg-live-ink"}`}
          aria-hidden
        />
        <span className="tabular">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-card border border-line bg-surface p-3 text-sm">
          <dl className="flex flex-col gap-2">
            {email && (
              <div>
                <dt className="text-xs text-ink-muted">Signed in as</dt>
                <dd className="break-all">{email}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-ink-muted">Wallet</dt>
              <dd className="tabular break-all text-xs">{address ?? "none yet"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Network</dt>
              <dd>
                {chain?.name ?? "unknown"}
                {offTarget && (
                  <span className="text-ink-muted">
                    {" "}
                    (switches to {targetChain.name} when you send a transaction)
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="mt-3 w-full rounded-control border border-line px-3 py-1.5 text-left text-sm"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
