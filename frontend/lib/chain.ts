import { hardhat, sepolia } from "viem/chains";

/**
 * The one chain this build of the app talks to. Local development runs on the Hardhat
 * node; checkpoint 12 sets NEXT_PUBLIC_CHAIN_ID to Sepolia's id for the deployed demo.
 *
 * Kept in one place because half a dozen screens will need to compare against it, and a
 * chain id copied around by hand is a chain id that eventually disagrees with itself.
 */
export const supportedChains = [hardhat, sepolia] as const;

const configuredId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? hardhat.id);

export const targetChain =
  supportedChains.find((chain) => chain.id === configuredId) ?? hardhat;

export const localRpcUrl = "http://127.0.0.1:8545";

/**
 * Which node to talk to, for whichever chain this build is pointed at.
 *
 * Returning undefined means "whatever viem thinks the default is", and on Sepolia that
 * default is a shared public-good endpoint with strict rate limits. The rentals page polls
 * a contract, so it reached those limits within minutes and every read came back 429.
 *
 * Two variables for one value. The server reads SEPOLIA_RPC_URL, which stays on the server.
 * The browser can only see NEXT_PUBLIC_SEPOLIA_RPC_URL, which is compiled into the bundle
 * and is therefore public: acceptable for a testnet key whose only cost is quota, and worth
 * restricting by domain in the provider's dashboard before showing anybody the link.
 *
 * Falls through to undefined when neither is set, which keeps a fresh checkout working
 * badly rather than not at all.
 */
export function rpcUrl(): string | undefined {
  if (targetChain.id === hardhat.id) return localRpcUrl;
  return (
    process.env.SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
    undefined
  );
}

/**
 * Where to go and read a transaction for yourself.
 *
 * The log says which of three ways a deposit was split, and saying so is not the same as
 * showing it. A verdict is a claim about money; the explorer holds the token transfers that
 * either happened or did not, under the agent's address, on a chain this project does not
 * control. That is the difference between a record and a receipt.
 *
 * Undefined on the local chain, which has no explorer, so callers render the hash as plain
 * text there rather than a link to nowhere. viem carries the explorer for each chain it
 * knows, so this reads it from there instead of hardcoding a hostname that would go stale.
 */
export function explorerTxUrl(hash: string): string | undefined {
  const base = targetChain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}
