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
