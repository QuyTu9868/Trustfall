const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Writes deployed addresses to frontend/lib/deployed.json so the frontend never needs
// a hand-copied address.
const OUTPUT_FILE = path.join(__dirname, "..", "..", "frontend", "lib", "deployed.json");

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
  // Only this address can apply a dispute verdict. It is the server's wallet, never
  // the agent's: the agent proposes over HTTP, the server signs.
  //
  // There is no second resolver. A human fallback with the same power used to sit beside
  // it and was removed on purpose: this exists to find out what an agent can be trusted
  // with, and a person standing behind it answers an easier question. A dispute the agent
  // never answers is finalisable by anyone after the verdict window, which returns the
  // deposit to the renter, so nothing is stuck and nobody has to be trusted for it.
  const agent = process.env.AGENT_ADDRESS || signers[signers.length - 2].address;
  for (const [label, value] of [
    ["TREASURY_ADDRESS", treasury],
    ["AGENT_ADDRESS", agent],
  ]) {
    if (!hre.ethers.isAddress(value)) {
      throw new Error(`${label} is not a valid address: ${value}`);
    }
  }
  console.log(`Treasury: ${treasury}`);
  console.log(`Agent:    ${agent}`);

  const escrow = await hre.ethers.deployContract("RentalEscrow", [
    usdcAddress,
    treasury,
    agent,
  ]);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`RentalEscrow: ${escrowAddress}`);

  const existing = fs.existsSync(OUTPUT_FILE)
    ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"))
    : {};
  // The spread keeps anything else already recorded for this chain, which also means it
  // would keep an address that no longer exists. admin was removed from the contract, so
  // it is deleted here rather than left behind for something to read and believe.
  const previous = { ...(existing[chainId] || {}) };
  delete previous.admin;

  existing[chainId] = {
    ...previous,
    mockUSDC: usdcAddress,
    rentalEscrow: escrowAddress,
    treasury,
    agent,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Wrote ${OUTPUT_FILE}`);

  // The ABI goes with it. Copying function signatures into the frontend by hand is how
  // the two drift apart: the contract changes, the copy does not, and the mismatch only
  // shows up as a failed transaction with no useful message.
  for (const [name, file] of [
    ["RentalEscrow", "escrow-abi.json"],
    ["MockUSDC", "usdc-abi.json"],
  ]) {
    const target = path.join(path.dirname(OUTPUT_FILE), file);
    const { abi } = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(target, JSON.stringify(abi, null, 2) + "\n");
    console.log(`Wrote ${target}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
