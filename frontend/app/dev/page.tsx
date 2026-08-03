"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { localRpcUrl, targetChain } from "@/lib/chain";
import { USDC_DECIMALS, getMockUsdcAddress, mockUsdcAbi } from "@/lib/contracts";
import { useNetworkReady } from "@/lib/use-network-ready";

/**
 * Developer tools, not part of the product. Kept because it is the quickest way to
 * confirm the chain, the deployed addresses and a real transaction all still work.
 */
export default function DevPage() {
  const { address, chain } = useAccount();
  const {
    ensureReady,
    authenticated,
    switching,
    error: networkError,
  } = useNetworkReady();
  const usdcAddress = getMockUsdcAddress(targetChain.id);

  const { data: gas } = useBalance({
    address,
    chainId: targetChain.id,
    query: { enabled: Boolean(address) },
  });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    chainId: targetChain.id,
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdcAddress && address) },
  });

  const {
    writeContractAsync,
    data: txHash,
    isPending: isMinting,
    error: writeError,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed) refetchBalance();
  }, [isConfirmed, refetchBalance]);

  // The point of this button: the network is fixed here, at transaction time, not by
  // nagging the user with a banner beforehand.
  async function mint() {
    if (!(await ensureReady())) return;
    if (!usdcAddress || !address) return;
    try {
      await writeContractAsync({
        address: usdcAddress,
        abi: mockUsdcAbi,
        functionName: "mint",
        chainId: targetChain.id,
        args: [address, parseUnits("100", USDC_DECIMALS)],
      });
    } catch {
      // writeError already carries it, and TxError below renders it.
    }
  }

  const txError = writeError ?? receiptError;
  const busy = switching || isMinting || isConfirming;

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Dev tools</h1>
        <p className="text-sm text-ink-muted">
          Not part of the product. Checks the chain, the deployed addresses and one real
          transaction.
        </p>
      </header>

      <section className="max-w-xl rounded-card border border-line bg-surface">
        <dl className="divide-y divide-line text-sm">
          <Row label="Target network">
            {targetChain.name} <span className="tabular">({targetChain.id})</span>
          </Row>
          <Row label="Wallet network">
            {!authenticated ? (
              <span className="text-ink-muted">not signed in</span>
            ) : (
              <>
                {chain?.name ?? "unknown"}
                {chain && chain.id !== targetChain.id && (
                  <span className="text-ink-muted"> (will switch on send)</span>
                )}
              </>
            )}
          </Row>
          <Row label="Wallet">
            <span className="tabular text-xs break-all">
              {address ?? "not signed in"}
            </span>
          </Row>
          <Row label="MockUSDC">
            <span className="tabular text-xs break-all">
              {usdcAddress ?? "not deployed on this chain"}
            </span>
          </Row>
          <Row label="Gas">
            <span className="tabular">
              {gas ? `${formatUnits(gas.value, 18)} ETH` : "-"}
            </span>
          </Row>
          <Row label="Balance">
            <span className="tabular">
              {balance === undefined
                ? "-"
                : `${formatUnits(balance, USDC_DECIMALS)} USDC`}
            </span>
          </Row>
        </dl>

        <div className="flex flex-col gap-3 border-t border-line p-4">
          {!usdcAddress ? (
            <p className="text-sm">
              No MockUSDC on chain {targetChain.id}. Deploy it first:
              <span className="tabular mt-1 block text-xs">
                cd contracts &amp;&amp; npm run setup:local
              </span>
            </p>
          ) : (
            <button
              onClick={mint}
              disabled={busy}
              className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas active:scale-[0.98] disabled:opacity-50"
            >
              {/* Say what the press will actually do. Unsigned-in, it opens the login
                  modal rather than minting anything. */}
              {!authenticated
                ? "Sign in to mint"
                : switching
                  ? "Switching network..."
                  : isMinting
                    ? "Confirm in wallet..."
                    : isConfirming
                      ? "Minting..."
                      : "Mint 100 USDC"}
            </button>
          )}

          {gas?.value === 0n && authenticated && (
            <p className="text-xs text-ink-muted">
              This wallet has no ETH on {targetChain.name}, so it cannot pay gas. Put the
              address above in{" "}
              <span className="tabular">contracts/.env</span> as{" "}
              <span className="tabular">DEV_WALLETS</span> and run{" "}
              <span className="tabular">npm run fund</span>.
            </p>
          )}

          {(networkError || txError) && (
            <p className="text-xs text-stop-ink">
              {networkError ?? readableError(txError)}
            </p>
          )}
        </div>
      </section>

      <TimeTravel />
      <ModerationSwitch />
    </main>
  );
}

/**
 * Pushes the local chain's clock forward, so the two waiting periods can be tested without
 * living through them.
 *
 * Three days is the dispute window: after a return, that is how long the owner has to
 * complain before the deposit can be released. Seven is the verdict window: once a dispute
 * is open, that is how long the arbitrator and the human resolver have before the deposit
 * goes back to the renter by default.
 *
 * Local only, and the check is on the chain id rather than NODE_ENV: this talks straight
 * to the Hardhat RPC, and there is nothing to be gained by rendering a button that a real
 * network would simply refuse.
 */
function TimeTravel() {
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  if (targetChain.id !== 31337) return null;

  async function skip(days: number) {
    setState("working");
    try {
      // evm_increaseTime only takes effect on the next block, so mine one straight after.
      // Without it the chain agrees to the new time but no contract has seen it yet.
      for (const [method, params] of [
        ["evm_increaseTime", [days * 24 * 60 * 60]],
        ["evm_mine", []],
      ] as const) {
        const response = await fetch(localRpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error.message);
      }
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 className="text-sm">Skip a waiting period</h2>
      <p className="text-xs text-ink-muted">
        Three days is the window to complain after a return. Seven is how long a dispute
        has before the deposit goes back to the renter by default.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => skip(3)}
          disabled={state === "working"}
          className="w-fit rounded-control border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Skip 3 days
        </button>
        <button
          onClick={() => skip(7)}
          disabled={state === "working"}
          className="w-fit rounded-control border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Skip 7 days
        </button>
      </div>
      {state === "working" && <p className="text-xs text-ink-muted">Skipping...</p>}
      {state === "done" && (
        <p className="text-xs text-ink-muted">
          Done. The countdowns follow the chain clock, so they move on their own.
        </p>
      )}
      {state === "failed" && (
        <p className="text-xs text-stop-ink">
          The local node did not answer. Is <span className="tabular">npx hardhat node</span>{" "}
          running?
        </p>
      )}
      {/* Renting still works afterwards now that permits are dated from the chain, but the
          clock itself only ever goes forward. */}
      <p className="text-xs text-ink-muted">
        One way. The chain clock cannot go back; restart the node to reset it.
      </p>
    </section>
  );
}

/**
 * Turns the listing check off and on without restarting anything.
 *
 * The state lives on the server, not here. This asks the server what it is and asks it to
 * change, which is why the button can exist at all: a page that could pass "skip the
 * check" along with a listing would be a page anyone could imitate.
 *
 * Local only, and the route enforces that itself rather than relying on this component
 * not being rendered.
 */
function ModerationSwitch() {
  const [bypassed, setBypassed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (targetChain.id !== 31337) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/dev/moderation");
        if (!response.ok) return;
        const result = await response.json();
        if (active) setBypassed(Boolean(result.bypassed));
      } catch {
        // Falls back to "the check is on", which is both the safe reading and the one
        // that leaves the button usable. Staying unknown would disable it forever behind
        // the word Checking, with no way to press anything.
        if (active) setBypassed(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (targetChain.id !== 31337) return null;

  async function toggle() {
    setBusy(true);
    try {
      const response = await fetch("/api/dev/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bypassed: !bypassed }),
      });
      const result = await response.json();
      setBypassed(Boolean(result.bypassed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 className="text-sm">Listing check</h2>
      <p className="text-xs text-ink-muted">
        Every listing is read by a model before it goes live. The free tier allows about
        one listing a minute, which is slow going when seeding demo data.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={busy || bypassed === null}
          className="w-fit rounded-control border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          {bypassed === null ? "Checking..." : bypassed ? "Turn the check back on" : "Skip the check"}
        </button>
        {bypassed !== null && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
              bypassed ? "bg-stop-bg text-stop-ink" : "bg-live-bg text-live-ink"
            }`}
          >
            {bypassed ? "off" : "on"}
          </span>
        )}
      </div>

      {bypassed && (
        <p className="text-xs text-stop-ink">
          Nothing is being checked. The listing page says so too, so a screenshot taken now
          will not look like a listing that passed.
        </p>
      )}

      <p className="text-xs text-ink-muted">
        Local chain only, and the server enforces that. On any real network this switch
        does nothing and the check always runs.
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

// viem's shortMessage is one readable line. message is a wall of technical detail.
function readableError(error: Error | null) {
  if (!error) return null;
  return "shortMessage" in error ? String(error.shortMessage) : error.message;
}
