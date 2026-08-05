const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/**
 * Gives the demo wallets enough Sepolia ETH for gas and enough MockUSDC to rent with.
 *
 * Separate from fund.js rather than a flag on it. That one sends ten ETH a wallet and
 * refuses to run anywhere but the local chain, which is the right rule for a script that
 * hands out imaginary money in imaginary quantities. Here the ETH is real in the sense
 * that it took a faucet and a wait to get, so the amounts are small and written down.
 *
 * The USDC costs nothing: MockUSDC.mint is open on purpose, so anybody can top themselves
 * up from /dev without asking. This only saves the first trip.
 */
const ETH_PER_WALLET = "0.02";
const USDC_PER_WALLET = "10000";

const DEPLOYED_FILE = path.join(__dirname, "..", "..", "frontend", "lib", "deployed.json");

async function main() {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (chainId !== 11155111) {
    throw new Error(`Refusing to run on chain ${chainId}. This one is for Sepolia.`);
  }

  const wallets = (process.env.DEV_WALLETS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (wallets.length === 0) throw new Error("DEV_WALLETS is empty in contracts/.env.");

  const usdcAddress = JSON.parse(fs.readFileSync(DEPLOYED_FILE, "utf8"))[chainId]?.mockUSDC;
  if (!usdcAddress) throw new Error("No MockUSDC on Sepolia yet. Deploy first.");

  const [funder] = await hre.ethers.getSigners();
  const usdc = await hre.ethers.getContractAt("MockUSDC", usdcAddress);
  const amount = hre.ethers.parseUnits(USDC_PER_WALLET, 6);

  for (const wallet of wallets) {
    // The funder is one of the wallets in the list, and sending ETH to itself would only
    // burn gas to move nothing.
    if (wallet.toLowerCase() !== funder.address.toLowerCase()) {
      await (
        await funder.sendTransaction({
          to: wallet,
          value: hre.ethers.parseEther(ETH_PER_WALLET),
        })
      ).wait();
    }

    await (await usdc.mint(wallet, amount)).wait();

    const eth = await hre.ethers.provider.getBalance(wallet);
    const held = await usdc.balanceOf(wallet);
    console.log(
      `${wallet}  ${Number(hre.ethers.formatEther(eth)).toFixed(4)} ETH  ` +
        `${hre.ethers.formatUnits(held, 6)} USDC`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
