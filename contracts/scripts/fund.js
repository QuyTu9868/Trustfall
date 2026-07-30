const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Tops up your own wallets on the local chain so you never have to paste a test
// private key into MetaMask. A fresh `hardhat node` wipes every balance, so run
// this again after each restart.
//
// Set DEV_WALLETS in contracts/.env to a comma separated list of addresses.
const DEPLOYED_FILE = path.join(__dirname, "..", "..", "web", "lib", "deployed.json");
const ETH_PER_WALLET = "10";
const USDC_PER_WALLET = 10_000n * 10n ** 6n;

async function main() {
  const wallets = (process.env.DEV_WALLETS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (wallets.length === 0) {
    throw new Error(
      "DEV_WALLETS is empty. Put your wallet address in contracts/.env, for example:\n" +
        "DEV_WALLETS=0xB84AeDb0F3F06D89Ca6154956ecF0F4DB77355Af"
    );
  }

  const invalid = wallets.filter((wallet) => !hre.ethers.isAddress(wallet));
  if (invalid.length > 0) {
    throw new Error(`Not a valid address: ${invalid.join(", ")}`);
  }

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (chainId !== 31337) {
    throw new Error(
      `Refusing to run on chain ${chainId}. This script mints free money and is for the local chain only.`
    );
  }

  const usdcAddress = JSON.parse(fs.readFileSync(DEPLOYED_FILE, "utf8"))[chainId]
    ?.mockUSDC;
  if (!usdcAddress) {
    throw new Error("No MockUSDC address yet. Run npm run deploy:local first.");
  }

  const [funder] = await hre.ethers.getSigners();
  const usdc = await hre.ethers.getContractAt("MockUSDC", usdcAddress);

  for (const wallet of wallets) {
    await (
      await funder.sendTransaction({
        to: wallet,
        value: hre.ethers.parseEther(ETH_PER_WALLET),
      })
    ).wait();
    await (await usdc.mint(wallet, USDC_PER_WALLET)).wait();
    console.log(`${wallet}  +${ETH_PER_WALLET} ETH  +10000 USDC`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
