import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { hardhat, sepolia } from "wagmi/chains";
import { http } from "wagmi";

// A real WalletConnect project id is only needed for the QR / mobile wallet option.
// Browser wallets like MetaMask work with the placeholder, so local dev is never blocked.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "trustfall-local-dev";

export const config = getDefaultConfig({
  appName: "Trustfall",
  projectId,
  chains: [hardhat, sepolia],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(),
  },
  ssr: true,
});
