const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Writes deployed addresses to web/lib/deployed.json so the frontend never needs
// a hand-copied address.
const OUTPUT_FILE = path.join(__dirname, "..", "..", "web", "lib", "deployed.json");

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(`Deploying with ${deployer.address} on chain ${chainId}`);

  const usdc = await hre.ethers.deployContract("MockUSDC");
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`MockUSDC: ${usdcAddress}`);

  // Give the deployer something to spend right away on a fresh local chain.
  const initialMint = 10_000n * 10n ** 6n;
  await (await usdc.mint(deployer.address, initialMint)).wait();
  console.log(`Minted 10000 USDC to ${deployer.address}`);

  // The 1% platform fee lands here. On the local chain use the last test account,
  // so fee income never mixes with the balances under test.
  const treasury = process.env.TREASURY_ADDRESS || signers[signers.length - 1].address;
  if (!hre.ethers.isAddress(treasury)) {
    throw new Error(`TREASURY_ADDRESS is not a valid address: ${treasury}`);
  }
  console.log(`Treasury: ${treasury}`);

  const escrow = await hre.ethers.deployContract("RentalEscrow", [usdcAddress, treasury]);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`RentalEscrow: ${escrowAddress}`);

  const existing = fs.existsSync(OUTPUT_FILE)
    ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"))
    : {};
  existing[chainId] = {
    ...(existing[chainId] || {}),
    mockUSDC: usdcAddress,
    rentalEscrow: escrowAddress,
    treasury,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
