"use client";

import { useEffect } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { targetChain } from "@/lib/chain";
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
              className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-white active:scale-[0.98] disabled:opacity-50"
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
    </main>
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
