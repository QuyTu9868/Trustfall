require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Contract tests live in test/*.t.sol and run with Foundry (forge test).
// Hardhat is here for compiling, running the local node, deploying and verifying.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Pinned so Hardhat and Foundry produce the same bytecode. OpenZeppelin 5.x
      // uses the mcopy opcode, which only exists from the Cancun upgrade onward.
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Hardhat defaults to a 60M block, but MetaMask falls back to 35% of the block
      // limit when it will not trust its own estimate, which is 21M, and the node now
      // enforces EIP-7825's per-transaction cap of 16777216. Every wallet-sent
      // transaction hit that ceiling and was rejected before the contract ran at all.
      // 30M is what mainnet actually uses, and 35% of it is comfortably under the cap.
      blockGasLimit: 30_000_000,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
