/**
 * Checkpoint 8: proves the thing that keeps a conversation private.
 *
 * Every chat and notification route funnels through readRentalAsParty, which asks the
 * contract who the two parties are instead of believing the request. That check is the
 * only thing standing between a signed in stranger and somebody else's messages, so it is
 * tested directly against a real rental on a real chain rather than assumed.
 *
 * Privy tokens cannot be minted from a script, so the auth layer above this is covered by
 * curling the routes without a session and confirming they answer 401.
 */
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { escrowAbi, escrowAddress, listingIdToBytes32, usdcAbi, usdcAddress } from "../lib/escrow";
import { RentalError, readRental, readRentalAsParty } from "../lib/rental-server";
import { badgeCount } from "../lib/badge-count";

const RPC = "http://127.0.0.1:8545";
const MNEMONIC = "test test test test test test test test test test test junk";

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

/** Runs something that should be refused, and reports which refusal came back. */
async function refused(label: string, expected: number, run: () => Promise<unknown>) {
  try {
    await run();
    check(label, false, "it was allowed through");
  } catch (error) {
    const status = error instanceof RentalError ? error.status : 0;
    check(label, status === expected, `got ${status}, wanted ${expected}`);
  }
}

async function main() {
  if (!escrowAddress || !usdcAddress) throw new Error("Nothing deployed. Run npm run setup:local.");

  const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 8 });
  const renter = mnemonicToAccount(MNEMONIC, { addressIndex: 9 });
  const stranger = mnemonicToAccount(MNEMONIC, { addressIndex: 10 });
  const ownerWallet = createWalletClient({ account: owner, chain: hardhat, transport: http(RPC) });
  const renterWallet = createWalletClient({ account: renter, chain: hardhat, transport: http(RPC) });

  console.log("Setting up one rental to guard\n");
  const price = parseUnits("10", 6);
  const deposit = parseUnits("5", 6);
  const total = price * 2n + deposit;

  await ownerWallet.writeContract({
    address: usdcAddress,
    abi: usdcAbi,
    functionName: "mint",
    args: [renter.address, total],
  });
  await renterWallet.writeContract({
    address: usdcAddress,
    abi: usdcAbi,
    functionName: "approve",
    args: [escrowAddress, total],
  });

  // From the chain, not from Date.now(). Skipping the local chain forward leaves the two
  // clocks days apart, and dates worked out from this machine land in the contract's past.
  const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
  const now = Number((await pub.getBlock()).timestamp);

  const hash = await renterWallet.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "requestRental",
    args: [
      // A fresh listing every run. The contract blocks double booking, so reusing one id
      // means the second run of this script fails on days the first run took.
      listingIdToBytes32(crypto.randomUUID()),
      owner.address,
      price,
      deposit,
      BigInt(now),
      BigInt(now + 2 * 24 * 60 * 60),
    ],
  });
  console.log(`  request sent ${hash.slice(0, 12)}...\n`);

  // The newest rental is the one just made.
  await pub.waitForTransactionReceipt({ hash });
  const rentalId =
    ((await pub.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "nextRentalId",
    })) as bigint) - 1n;

  console.log(`Guarding rental #${rentalId}\n`);

  const asOwner = await readRentalAsParty(rentalId, owner.address.toLowerCase());
  check(
    "the owner is let in, and the rental read back is the right one",
    asOwner.rental.id === rentalId && asOwner.rental.owner === owner.address.toLowerCase(),
    `#${asOwner.rental.id} owned by ${asOwner.rental.owner}`
  );
  check(
    "and is told the renter is the other side",
    asOwner.counterparty === renter.address.toLowerCase(),
    asOwner.counterparty
  );

  const asRenter = await readRentalAsParty(rentalId, renter.address.toLowerCase());
  check(
    "the renter is let in, and sees the owner as the other side",
    asRenter.counterparty === owner.address.toLowerCase(),
    asRenter.counterparty
  );

  await refused("a third wallet is refused, not shown the thread", 403, () =>
    readRentalAsParty(rentalId, stranger.address.toLowerCase())
  );

  // Case matters here. The whole guard collapses to a string compare, and an address that
  // arrives checksummed would match nobody and lock out the real party.
  await refused("a checksummed address is refused, so callers must lowercase", 403, () =>
    readRentalAsParty(rentalId, owner.address)
  );

  await refused("a rental that was never created is a 404", 404, () =>
    readRental(999_999)
  );
  await refused("a rental id that is not a number is a 400", 400, () =>
    readRental("not-a-number")
  );

  check("status comes from the chain, not the caller", asOwner.rental.status === "Requested", asOwner.rental.status);

  console.log("\nWhat the badge shows\n");
  for (const [count, want] of [
    [0, null],
    [1, "1"],
    [9, "9"],
    [10, "10"],
    [11, "10+"],
    [4000, "10+"],
  ] as const) {
    check(`${count} unread reads as ${want ?? "no badge at all"}`, badgeCount(count) === want, `got ${badgeCount(count)}`);
  }

  console.log(`\n${failed === 0 ? "ALL GREEN" : "SOMETHING BROKE"}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
