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
