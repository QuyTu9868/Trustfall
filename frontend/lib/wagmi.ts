import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { hardhat, sepolia } from "viem/chains";
import { localRpcUrl } from "./chain";

/**
 * Privy's createConfig, not wagmi's. It takes no connectors on purpose: Privy owns the
 * wallet list, both the embedded wallet it makes for email users and whichever browser
 * wallet someone picks. That is also why RainbowKit is gone. One way in beats two.
 */
export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia],
  transports: {
    [hardhat.id]: http(localRpcUrl),
    [sepolia.id]: http(),
  },
  ssr: true,
});
