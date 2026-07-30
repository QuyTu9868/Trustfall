"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect } from "react";
import { formatUnits, parseUnits } from "viem";
import { hardhat } from "wagmi/chains";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { USDC_DECIMALS, getMockUsdcAddress, mockUsdcAbi } from "@/lib/contracts";

// Checkpoint 0 smoke test page. The real UI is built in checkpoint 3.
export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const usdcAddress = getMockUsdcAddress(chain?.id);

  // Gas is a prerequisite for minting, so check it before offering the button.
  const { data: gas } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });
  const hasGas = gas === undefined ? undefined : gas.value > 0n;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdcAddress && address) },
  });

  const {
    writeContract,
    data: txHash,
    isPending: isMinting,
    error: writeError,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Balance only changes once the mint transaction is mined.
  useEffect(() => {
    if (isConfirmed) refetchBalance();
  }, [isConfirmed, refetchBalance]);

  function mint() {
    if (!usdcAddress || !address) return;
    writeContract({
      address: usdcAddress,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [address, parseUnits("100", USDC_DECIMALS)],
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Trustfall</h1>
        <p className="text-sm text-neutral-500">
          Checkpoint 0 smoke test. Connect a wallet on Localhost 8545 and mint
          test USDC.
        </p>
      </header>

      <ConnectButton />

      {/* Prerequisites in order: connected, right network, contract deployed. */}
      {!isConnected ? (
        <p className="text-sm text-neutral-500">Connect a wallet to continue.</p>
      ) : chain?.id !== hardhat.id ? (
        <div className="flex flex-col items-start gap-3 border border-neutral-300 p-4">
          <p className="text-sm">
            Wrong network: {chain?.name ?? "unknown"}. Local development runs on
            Localhost 8545.
          </p>
          <button
            onClick={() => switchChain({ chainId: hardhat.id })}
            disabled={isSwitching}
            className="border border-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isSwitching ? "Switching..." : "Switch to Localhost"}
          </button>
        </div>
      ) : !usdcAddress ? (
        <div className="border border-neutral-300 p-4 text-sm">
          No MockUSDC address for chain {chain.id}. Run the deploy script:
          <pre className="mt-2 overflow-x-auto bg-neutral-100 p-2 text-xs">
            cd contracts && npm run deploy:local
          </pre>
        </div>
      ) : (
        <div className="flex flex-col gap-4 border border-neutral-300 p-4 text-sm">
          <dl className="flex flex-col gap-3">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Network</dt>
              <dd>
                {chain.name} ({chain.id})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Wallet</dt>
              <dd className="font-mono text-xs break-all">{address}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">MockUSDC</dt>
              <dd className="font-mono text-xs break-all">{usdcAddress}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Gas</dt>
              <dd>{gas ? `${formatUnits(gas.value, 18)} ETH` : "loading..."}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Balance</dt>
              <dd>
                {balance === undefined
                  ? "loading..."
                  : `${formatUnits(balance, USDC_DECIMALS)} USDC`}
              </dd>
            </div>
          </dl>

          {/* A fresh hardhat node knows nothing about your wallet, so it starts
              with zero ETH and cannot pay for any transaction. */}
          {hasGas === false ? (
            <div className="border-t border-neutral-200 pt-4">
              <p>
                This wallet has no ETH on the local chain, so it cannot pay gas.
                Put the address above in <code>contracts/.env</code> and top it
                up:
              </p>
              <pre className="mt-2 overflow-x-auto bg-neutral-100 p-2 text-xs">
                {`DEV_WALLETS=${address}\n\ncd contracts && npm run fund`}
              </pre>
            </div>
          ) : (
            <button
              onClick={mint}
              disabled={isMinting || isConfirming || hasGas === undefined}
              className="border border-neutral-900 px-3 py-1.5 disabled:opacity-50"
            >
              {isMinting
                ? "Confirm in wallet..."
                : isConfirming
                  ? "Minting..."
                  : "Mint 100 USDC"}
            </button>
          )}

          <TxError error={writeError ?? receiptError} />
        </div>
      )}
    </main>
  );
}

// Never swallow a failed transaction. A button that quietly resets tells the
// user nothing about why it did not work.
function TxError({ error }: { error: Error | null }) {
  if (!error) return null;
  const message =
    "shortMessage" in error ? String(error.shortMessage) : error.message;
  return (
    <p className="border-t border-neutral-200 pt-4 text-xs text-red-700">
      {message}
    </p>
  );
}
