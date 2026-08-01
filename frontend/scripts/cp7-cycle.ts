/**
 * Checkpoint 7 end to end: a whole rental from request to Completed, on the local chain.
 *
 * Imports the frontend's own modules rather than reimplementing them, so a bug in
 * listingIdToBytes32 or the handover encoding fails here rather than only in the browser.
 * Wallets come from Hardhat's public test mnemonic, never from the user's .env.
 */
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { escrowAbi, escrowAddress, usdcAbi, usdcAddress, listingIdToBytes32, toRental, type RentalTuple } from "../lib/escrow";
import { HANDOVER_TYPES, HANDOVER_PRIMARY } from "../lib/handover";

const RPC = "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";

const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` ${detail}` : ""}`);
  }
}

function usd(value: bigint) {
  return `${formatUnits(value, 6)} USDC`;
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) throw new Error(`${method}: ${result.error.message}`);
  return result.result;
}

/** Bring the browser-side clock forward too, so permit deadlines stay in the future. */
async function skip(seconds: number, why: string) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine", []);
  const block = await pub.getBlock();
  console.log(`\n  ~ skipped ${seconds}s (${why}); chain time now ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
}

async function wait(hash: `0x${string}`, label: string) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

async function readRental(id: bigint) {
  const tuple = (await pub.readContract({
    address: escrowAddress!,
    abi: escrowAbi,
    functionName: "rentals",
    args: [id],
  })) as RentalTuple;
  return toRental(id, tuple);
}

async function main() {
  if (!escrowAddress || !usdcAddress) throw new Error("Nothing deployed. Run npm run setup:local.");
  console.log(`escrow ${escrowAddress}\nusdc   ${usdcAddress}\n`);

  // Accounts 5 and 6, well clear of the ones the deploy script and the user's wallets use.
  const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 5 });
  const renter = mnemonicToAccount(MNEMONIC, { addressIndex: 6 });
  const ownerWallet = createWalletClient({ account: owner, chain: hardhat, transport: http(RPC) });
  const renterWallet = createWalletClient({ account: renter, chain: hardhat, transport: http(RPC) });

  const treasury = (await pub.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "treasury",
  })) as `0x${string}`;

  const PRICE = parseUnits("50", 6);
  const DEPOSIT = parseUnits("20", 6);

  // ---- Setup: give the renter money to spend -------------------------------
  await wait(
    await ownerWallet.writeContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: "mint",
      args: [renter.address, parseUnits("1000", 6)],
    }),
    "mint"
  );

  const balance = (who: `0x${string}`) =>
    pub.readContract({ address: usdcAddress!, abi: usdcAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

  const before = {
    renter: await balance(renter.address),
    owner: await balance(owner.address),
    treasury: await balance(treasury),
    // Earlier rentals may still be parked here, so this is the baseline to come back to
    // rather than an expectation that the contract ends up empty.
    escrow: await balance(escrowAddress),
  };

  // ---- 1. Request, with the permit merged in -------------------------------
  console.log("\n1. Request with permit");
  const block = await pub.getBlock();
  const chainNow = Number(block.timestamp);
  const startDate = BigInt(chainNow);
  const endDate = BigInt(chainNow + 2 * 24 * 60 * 60);
  const rent = PRICE * 2n;
  const total = rent + DEPOSIT;

  const permitDeadline = BigInt(chainNow + 3600);
  const nonce = (await pub.readContract({ address: usdcAddress, abi: usdcAbi, functionName: "nonces", args: [renter.address] })) as bigint;
  const [, name, version] = (await pub.readContract({ address: usdcAddress, abi: usdcAbi, functionName: "eip712Domain" })) as [string, string, string];

  const permitSig = await renterWallet.signTypedData({
    domain: { name, version, chainId: hardhat.id, verifyingContract: usdcAddress },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner: renter.address, spender: escrowAddress, value: total, nonce, deadline: permitDeadline },
  });
  const r = `0x${permitSig.slice(2, 66)}` as `0x${string}`;
  const s = `0x${permitSig.slice(66, 130)}` as `0x${string}`;
  const v = Number.parseInt(permitSig.slice(130, 132), 16);

  const listingId = listingIdToBytes32("a7a17952-fc67-4111-b25d-dcb2ff57992a");
  const requestReceipt = await wait(
    await renterWallet.writeContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "requestRentalWithPermit",
      args: [listingId, owner.address, PRICE, DEPOSIT, startDate, endDate, permitDeadline, v, r, s],
    }),
    "requestRentalWithPermit"
  );

  const id = (await pub.readContract({ address: escrowAddress, abi: escrowAbi, functionName: "nextRentalId" })) as bigint - 1n;
  console.log(`  rental #${id}, ${requestReceipt.gasUsed} gas, one signature and one transaction`);

  let rental = await readRental(id);
  check("status is Requested", rental.status === "Requested", `got ${rental.status}`);
  check("escrow holds rent plus deposit", (await balance(escrowAddress)) >= total, usd(total));

  // ---- 2. Owner approves ---------------------------------------------------
  console.log("\n2. Owner approves");
  await wait(await ownerWallet.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: "approveRental", args: [id] }), "approveRental");
  rental = await readRental(id);
  check("status is Approved", rental.status === "Approved", `got ${rental.status}`);

  // ---- 3. Check-in: owner signs, renter sends ------------------------------
  console.log("\n3. Check-in, owner shows the code and the renter submits it");
  const domain = { name: "Trustfall", version: "1", chainId: hardhat.id, verifyingContract: escrowAddress };
  let handoverNonce = (await pub.readContract({ address: escrowAddress, abi: escrowAbi, functionName: "rentalNonce", args: [id] })) as bigint;
  let deadline = BigInt((await pub.getBlock()).timestamp) + 600n;

  const checkInSig = await ownerWallet.signTypedData({
    domain,
    types: HANDOVER_TYPES.checkIn,
    primaryType: HANDOVER_PRIMARY.checkIn,
    message: { rentalId: id, nonce: handoverNonce, deadline },
  });
  await wait(
    await renterWallet.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: "checkIn", args: [id, deadline, checkInSig] }),
    "checkIn"
  );
  rental = await readRental(id);
  check("status is Active", rental.status === "Active", `got ${rental.status}`);
  check("nobody was paid at check-in", (await balance(owner.address)) === before.owner, "rent stays in escrow until it comes back");

  // ---- 4. Keep it 25 hours, which is two days at 24 hours a day ------------
  await skip(25 * 60 * 60, "renter keeps the item 25 hours");

  // ---- 5. Check-out: renter signs, owner sends -----------------------------
  console.log("\n5. Check-out, the renter shows the code and the owner submits it");
  handoverNonce = (await pub.readContract({ address: escrowAddress, abi: escrowAbi, functionName: "rentalNonce", args: [id] })) as bigint;
  deadline = BigInt((await pub.getBlock()).timestamp) + 600n;
  const checkOutSig = await renterWallet.signTypedData({
    domain,
    types: HANDOVER_TYPES.checkOut,
    primaryType: HANDOVER_PRIMARY.checkOut,
    message: { rentalId: id, nonce: handoverNonce, deadline },
  });
  const outReceipt = await wait(
    await ownerWallet.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: "checkOut", args: [id, deadline, checkOutSig] }),
    "checkOut"
  );
  rental = await readRental(id);
  check("status is Returned", rental.status === "Returned", `got ${rental.status}`);

  // The settlement the UI reads. Same source, so if this is right the screen is right.
  const settledLogs = await pub.getLogs({
    address: escrowAddress,
    event: {
      type: "event",
      name: "RentSettled",
      inputs: [
        { name: "id", type: "uint256", indexed: true },
        { name: "charged", type: "uint256" },
        { name: "toOwner", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "refundedToRenter", type: "uint256" },
      ],
    },
    args: { id },
    fromBlock: outReceipt.blockNumber,
  });
  const settled = settledLogs.at(-1)?.args as { charged: bigint; toOwner: bigint; fee: bigint; refundedToRenter: bigint };
  console.log(`  charged ${usd(settled.charged)}, owner ${usd(settled.toOwner)}, fee ${usd(settled.fee)}, refund ${usd(settled.refundedToRenter)}`);

  check("25 hours is charged as 2 days", settled.charged === PRICE * 2n, `expected ${usd(PRICE * 2n)}, got ${usd(settled.charged)}`);
  check("fee is 1 percent", settled.fee === (settled.charged * 100n) / 10000n, usd(settled.fee));
  check("owner gets the rest, nothing rounds away", settled.toOwner + settled.fee === settled.charged);
  check("no refund on a fully used booking", settled.refundedToRenter === 0n);
  check("owner was actually paid", (await balance(owner.address)) === before.owner + settled.toOwner);
  check("treasury got the fee", (await balance(treasury)) === before.treasury + settled.fee);
  check("deposit is still held", (await balance(escrowAddress)) >= DEPOSIT);

  // ---- 6. Finalize is refused until the dispute window closes --------------
  console.log("\n6. Deposit release");
  let refusedEarly = false;
  try {
    await pub.simulateContract({ address: escrowAddress, abi: escrowAbi, functionName: "finalize", args: [id], account: renter });
  } catch {
    refusedEarly = true;
  }
  check("finalize is refused before 3 days are up", refusedEarly);

  const releaseAt = rental.returnedAt + 3n * 24n * 60n * 60n;
  console.log(`  countdown target ${new Date(Number(releaseAt) * 1000).toISOString()}`);

  await skip(3 * 24 * 60 * 60 + 60, "the 3 day dispute window");

  // Anyone can call it, so a stranger does, proving the renter is not held hostage.
  const stranger = mnemonicToAccount(MNEMONIC, { addressIndex: 7 });
  const strangerWallet = createWalletClient({ account: stranger, chain: hardhat, transport: http(RPC) });
  await wait(await strangerWallet.writeContract({ address: escrowAddress, abi: escrowAbi, functionName: "finalize", args: [id] }), "finalize");

  rental = await readRental(id);
  check("status is Completed", rental.status === "Completed", `got ${rental.status}`);

  const after = {
    renter: await balance(renter.address),
    owner: await balance(owner.address),
    treasury: await balance(treasury),
    escrow: await balance(escrowAddress),
  };

  console.log(`\n  renter   ${usd(before.renter)} -> ${usd(after.renter)}`);
  console.log(`  owner    ${usd(before.owner)} -> ${usd(after.owner)}`);
  console.log(`  treasury ${usd(before.treasury)} -> ${usd(after.treasury)}`);

  check("renter paid exactly the rent, deposit came back in full", before.renter - after.renter === settled.charged, `${usd(before.renter - after.renter)}`);
  check("owner earned rent minus the 1 percent", after.owner - before.owner === settled.toOwner);
  check("escrow is back to where it started, nothing stuck", after.escrow === before.escrow, `${usd(before.escrow)} -> ${usd(after.escrow)}`);
  check("money in equals money out", (before.renter - after.renter) === (after.owner - before.owner) + (after.treasury - before.treasury));

  // ---- 7. Bring one back early -------------------------------------------
  // The card has a "refunded, days not used" row that the run above never reaches,
  // because a fully used booking has nothing to refund. An unexercised row on a screen
  // about money is exactly the kind of thing that turns out to be wired to nothing.
  console.log("\n7. Returned after two hours of a two day booking");
  const early = await runShortRental(owner, renter, ownerWallet, renterWallet, PRICE, DEPOSIT, 2 * 60 * 60);
  console.log(`  charged ${usd(early.charged)}, refund ${usd(early.refundedToRenter)}`);
  check("two hours is charged as one day", early.charged === PRICE, `expected ${usd(PRICE)}, got ${usd(early.charged)}`);
  check("the unused day is refunded", early.refundedToRenter === PRICE, usd(early.refundedToRenter));
  check("charge plus refund is the whole booking", early.charged + early.refundedToRenter === PRICE * 2n);

  console.log(`\n${failed === 0 ? "ALL GREEN" : "SOMETHING BROKE"}: ${passed} passed, ${failed} failed`);
  console.log(
    "\nNote: this run pushed the chain clock days ahead. Restart the Hardhat node before\n" +
      "testing in the browser, or every permit signature will look expired."
  );
  process.exit(failed === 0 ? 0 : 1);
}

type Wallet = ReturnType<typeof createWalletClient>;
type Account = ReturnType<typeof mnemonicToAccount>;

/** A second rental taken all the way to Returned, to read its settlement. */
async function runShortRental(
  owner: Account,
  renter: Account,
  ownerWallet: Wallet,
  renterWallet: Wallet,
  price: bigint,
  deposit: bigint,
  heldFor: number
) {
  const escrow = escrowAddress!;
  const usdcToken = usdcAddress!;
  const chainNow = Number((await pub.getBlock()).timestamp);
  const total = price * 2n + deposit;

  const permitDeadline = BigInt(chainNow + 3600);
  const nonce = (await pub.readContract({ address: usdcToken, abi: usdcAbi, functionName: "nonces", args: [renter.address] })) as bigint;
  const [, name, version] = (await pub.readContract({ address: usdcToken, abi: usdcAbi, functionName: "eip712Domain" })) as [string, string, string];
  const sig = await renterWallet.signTypedData({
    account: renter,
    domain: { name, version, chainId: hardhat.id, verifyingContract: usdcToken },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner: renter.address, spender: escrow, value: total, nonce, deadline: permitDeadline },
  });

  await wait(
    await renterWallet.writeContract({
      account: renter,
      chain: hardhat,
      address: escrow,
      abi: escrowAbi,
      functionName: "requestRentalWithPermit",
      args: [
        listingIdToBytes32("b1c2d3e4-0000-4000-8000-000000000001"),
        owner.address,
        price,
        deposit,
        BigInt(chainNow),
        BigInt(chainNow + 2 * 24 * 60 * 60),
        permitDeadline,
        Number.parseInt(sig.slice(130, 132), 16),
        `0x${sig.slice(2, 66)}` as `0x${string}`,
        `0x${sig.slice(66, 130)}` as `0x${string}`,
      ],
    }),
    "requestRentalWithPermit"
  );

  const id = ((await pub.readContract({ address: escrow, abi: escrowAbi, functionName: "nextRentalId" })) as bigint) - 1n;
  await wait(await ownerWallet.writeContract({ account: owner, chain: hardhat, address: escrow, abi: escrowAbi, functionName: "approveRental", args: [id] }), "approveRental");

  const domain = { name: "Trustfall", version: "1", chainId: hardhat.id, verifyingContract: escrow };
  const sign = async (wallet: Wallet, account: Account, action: "checkIn" | "checkOut") => {
    const handoverNonce = (await pub.readContract({ address: escrow, abi: escrowAbi, functionName: "rentalNonce", args: [id] })) as bigint;
    const deadline = BigInt((await pub.getBlock()).timestamp) + 600n;
    const message = { rentalId: id, nonce: handoverNonce, deadline };
    // Written out per action rather than indexed by it. Indexing gives viem a union of
    // two primary types and it intersects the message shapes down to never, even though
    // both actions carry the same three fields.
    const signature =
      action === "checkIn"
        ? await wallet.signTypedData({ account, domain, types: HANDOVER_TYPES.checkIn, primaryType: HANDOVER_PRIMARY.checkIn, message })
        : await wallet.signTypedData({ account, domain, types: HANDOVER_TYPES.checkOut, primaryType: HANDOVER_PRIMARY.checkOut, message });
    return { deadline, signature };
  };

  const inCode = await sign(ownerWallet, owner, "checkIn");
  await wait(
    await renterWallet.writeContract({ account: renter, chain: hardhat, address: escrow, abi: escrowAbi, functionName: "checkIn", args: [id, inCode.deadline, inCode.signature] }),
    "checkIn"
  );

  await skip(heldFor, "a short rental");

  const outCode = await sign(renterWallet, renter, "checkOut");
  const receipt = await wait(
    await ownerWallet.writeContract({ account: owner, chain: hardhat, address: escrow, abi: escrowAbi, functionName: "checkOut", args: [id, outCode.deadline, outCode.signature] }),
    "checkOut"
  );

  const logs = await pub.getLogs({
    address: escrow,
    event: {
      type: "event",
      name: "RentSettled",
      inputs: [
        { name: "id", type: "uint256", indexed: true },
        { name: "charged", type: "uint256" },
        { name: "toOwner", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "refundedToRenter", type: "uint256" },
      ],
    },
    args: { id },
    fromBlock: receipt.blockNumber,
  });
  return logs.at(-1)!.args as { charged: bigint; toOwner: bigint; fee: bigint; refundedToRenter: bigint };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
