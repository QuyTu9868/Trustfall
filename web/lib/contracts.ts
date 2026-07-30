import { erc20Abi } from "viem";
import deployed from "./deployed.json";

// contracts/scripts/deploy.js writes this file, keyed by chain id.
type DeployedAddresses = Record<string, { mockUSDC?: string } | undefined>;

/// MockUSDC is a plain ERC20 plus an open mint faucet, so reuse viem's erc20Abi.
export const mockUsdcAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const USDC_DECIMALS = 6;

export function getMockUsdcAddress(
  chainId: number | undefined
): `0x${string}` | undefined {
  if (!chainId) return undefined;
  const address = (deployed as DeployedAddresses)[String(chainId)]?.mockUSDC;
  return address ? (address as `0x${string}`) : undefined;
}
