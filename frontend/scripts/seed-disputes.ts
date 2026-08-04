/**
 * Builds three finished rentals that are already in dispute, and lets the arbitrator judge
 * each one. Local chain only.
 *
 * Made for looking at rather than for asserting. The suites in cp9 and cp10 prove the
 * agents decide correctly against fixed inputs; this one produces the thing a person opens
 * /admin to read, on real rentals, with real signatures and real money moving.
 *
 * The three cases are chosen to land on three different outcomes, because a log where
 * every row says the same thing proves nothing about whether the arbitrator is reading.
 *
 * Uses the wallets in .env.test so the rentals also show up in the app under the accounts
 * the user signs in with. Their keys are read, never printed.
 */
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  escrowAbi,
  escrowAddress,
  listingIdToBytes32,
  toRental,
  usdcAbi,
  usdcAddress,
  type RentalTuple,
} from "../lib/escrow";
import { HANDOVER_PRIMARY, HANDOVER_TYPES } from "../lib/handover";
import { resolveDispute } from "../lib/resolve-dispute";
import { getSupabaseAdmin } from "../lib/supabase-server";

const RPC = "http://127.0.0.1:8545";
const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });

type Case = {
  title: string;
  category: "house" | "vehicle" | "clothing";
  description: string;
  pricePerDay: string;
  deposit: string;
  ownerSays: string;
  renterSays: string;
  chat: { from: "owner" | "renter"; body: string }[];
  expect: string;
};

const CASES: Case[] = [
  {
    title: "Honda Wave 110, 2019",
    category: "vehicle",
    description: "Well kept scooter, new tyres last month. Helmet included.",
    pricePerDay: "12",
    deposit: "20",
    ownerSays:
      "He gave it back late in the evening and I think there is a scratch on the side panel. I want the deposit.",
    renterSays:
      "I returned it at 6pm as we agreed, in the same condition. He looked it over and said it was fine, then messaged about a scratch two days later.",
    chat: [
      { from: "renter", body: "Just parked it downstairs, keys with the guard." },
      { from: "owner", body: "Got it, looks fine, thanks. Nice doing business." },
      { from: "owner", body: "Actually hold on, is that a scratch on the side? I only noticed now." },
    ],
    expect: "deposit back to the renter",
  },
  {
    title: "Canon EOS R6 with 24-70mm",
    category: "clothing",
    description: "Body and lens, one battery, SD card included.",
    pricePerDay: "30",
    deposit: "40",
    ownerSays:
      "The lens mount is bent and the autofocus does not work. It was working when I handed it over, I tested it in front of him.",
    renterSays:
      "I did drop it on the second day. I am sorry. It still took photos afterwards so I do not think it is as bad as he says.",
    chat: [
      { from: "renter", body: "Bad news, I dropped the camera today. It still works but the lens feels loose." },
      { from: "owner", body: "How did that happen? That lens is worth more than the body." },
      { from: "renter", body: "It slipped off the table. I will pay for what it costs." },
    ],
    expect: "the owner keeps the deposit",
  },
  {
    title: "Studio apartment near Ben Thanh",
    category: "house",
    description: "35 square metres, air conditioning, washing machine, wifi.",
    pricePerDay: "25",
    deposit: "30",
    ownerSays: "The apartment was left filthy. Rubbish everywhere and a burn mark on the counter.",
    renterSays: "I cleaned it before leaving and there was no burn mark. This is not true.",
    chat: [],
    expect: "below the confidence bar, left for a human",
  },
];

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

async function wait(hash: `0x${string}`, label: string) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

async function main() {
  if (!escrowAddress || !usdcAddress) {
    throw new Error("Nothing deployed. Run npm run setup:local in contracts first.");
  }
  // Copied into locals because the check above does not narrow an imported binding inside
  // the closures below, and every call there would otherwise take an address of undefined.
  const escrow = escrowAddress;
  const usdc = usdcAddress;

  const ownerKey = process.env.Test_1;
  const renterKey = process.env.Test_2;
  if (!ownerKey || !renterKey) {
    throw new Error("Test_1 and Test_2 must be set. They live in .env.test at the repo root.");
  }

  const owner = privateKeyToAccount(ownerKey as `0x${string}`);
  const renter = privateKeyToAccount(renterKey as `0x${string}`);
  const ownerWallet = createWalletClient({ account: owner, chain: hardhat, transport: http(RPC) });
  const renterWallet = createWalletClient({ account: renter, chain: hardhat, transport: http(RPC) });
  const supabase = getSupabaseAdmin();

  console.log(`owner  ${owner.address}\nrenter ${renter.address}\n`);

  for (const item of CASES) {
    console.log(`\n=== ${item.title} ===`);

    // The listing, published and already approved by the moderator. Running it through the
    // checker again would spend a request on a decision this script is not testing.
    const { data: listing, error } = await supabase
      .from("listings")
      .insert({
        owner_address: owner.address.toLowerCase(),
        category: item.category,
        title: item.title,
        description: item.description,
        price_per_day: item.pricePerDay,
        deposit: item.deposit,
        status: "published",
        moderation_status: "approved",
      })
      .select("id")
      .single();
    if (error || !listing) throw new Error(`listing insert failed: ${error?.message}`);

    const price = parseUnits(item.pricePerDay, 6);
    const deposit = parseUnits(item.deposit, 6);

    // Mine an empty block before reading the clock. Hardhat only makes a block when a
    // transaction arrives, so an idle node still reports the timestamp of whenever it last
    // did something: measured here at 68 minutes stale. Signing a permit against that
    // stale reading produces a deadline already in the past by the time the request is
    // mined, the permit reverts inside the contract's try, and what surfaces is
    // ERC20InsufficientAllowance, which sends you looking for a missing approval instead.
    await rpc("evm_mine", []);
    const chainNow = Number((await pub.getBlock()).timestamp);
    const total = price * 2n + deposit;

    // One signature for the money and one transaction for the request, same as the app.
    const permitDeadline = BigInt(chainNow + 3600);
    const nonce = (await pub.readContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "nonces",
      args: [renter.address],
    })) as bigint;
    const [, name, version] = (await pub.readContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "eip712Domain",
    })) as [string, string, string];

    const permit = await renterWallet.signTypedData({
      domain: { name, version, chainId: hardhat.id, verifyingContract: usdc },
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
      message: {
        owner: renter.address,
        spender: escrow,
        value: total,
        nonce,
        deadline: permitDeadline,
      },
    });

    await wait(
      await renterWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "requestRentalWithPermit",
        args: [
          listingIdToBytes32(listing.id),
          owner.address,
          price,
          deposit,
          BigInt(chainNow),
          BigInt(chainNow + 2 * 24 * 60 * 60),
          permitDeadline,
          Number.parseInt(permit.slice(130, 132), 16),
          `0x${permit.slice(2, 66)}` as `0x${string}`,
          `0x${permit.slice(66, 130)}` as `0x${string}`,
        ],
      }),
      "requestRentalWithPermit"
    );

    const id =
      ((await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "nextRentalId",
      })) as bigint) - 1n;

    await wait(
      await ownerWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "approveRental",
        args: [id],
      }),
      "approveRental"
    );

    // Check-in: the owner signs the code, the renter is the one who sends it.
    const domain = { name: "Trustfall", version: "1", chainId: hardhat.id, verifyingContract: escrow };
    const handover = async (kind: "checkIn" | "checkOut") => {
      const handoverNonce = (await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "rentalNonce",
        args: [id],
      })) as bigint;
      const deadline = BigInt((await pub.getBlock()).timestamp) + 600n;
      // Whoever is handing the item over shows the code; the other one submits it.
      const signer = kind === "checkIn" ? ownerWallet : renterWallet;
      const sender = kind === "checkIn" ? renterWallet : ownerWallet;
      const message = { rentalId: id, nonce: handoverNonce, deadline };
      const signature =
        kind === "checkIn"
          ? await signer.signTypedData({
              domain,
              types: HANDOVER_TYPES.checkIn,
              primaryType: HANDOVER_PRIMARY.checkIn,
              message,
            })
          : await signer.signTypedData({
              domain,
              types: HANDOVER_TYPES.checkOut,
              primaryType: HANDOVER_PRIMARY.checkOut,
              message,
            });
      await wait(
        await sender.writeContract({
          address: escrow,
          abi: escrowAbi,
          functionName: kind,
          args: [id, deadline, signature],
        }),
        kind
      );
    };

    await handover("checkIn");
    await rpc("evm_increaseTime", [25 * 60 * 60]);
    await rpc("evm_mine", []);
    await handover("checkOut");

    await wait(
      await ownerWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "openDispute",
        args: [id],
      }),
      "openDispute"
    );

    const rental = toRental(
      id,
      (await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "rentals",
        args: [id],
      })) as RentalTuple
    );
    console.log(`  rental #${id} is ${rental.status}`);

    // The conversation happened during the rental, so it is written first and dated before
    // the statements. The arbitrator is told to weigh it more heavily for exactly that
    // reason, and dates that said otherwise would quietly undermine the instruction.
    if (item.chat.length) {
      const { error: chatError } = await supabase.from("messages").insert(
        item.chat.map((line, index) => ({
          onchain_rental_id: Number(id),
          sender_address: (line.from === "owner" ? owner.address : renter.address).toLowerCase(),
          body: line.body,
          created_at: new Date(Date.now() - (item.chat.length - index) * 3600_000).toISOString(),
        }))
      );
      if (chatError) throw new Error(`chat insert failed: ${chatError.message}`);
    }

    // Checked rather than assumed. An insert that fails here returns an error object and
    // carries on, and the first sign of it is the arbitrator saying nobody filed anything,
    // which reads like a bug in the arbitrator.
    const { error: evidenceError } = await supabase.from("dispute_evidence").insert([
      {
        onchain_rental_id: Number(id),
        side: "owner",
        author_address: owner.address.toLowerCase(),
        statement: item.ownerSays,
      },
      {
        onchain_rental_id: Number(id),
        side: "renter",
        author_address: renter.address.toLowerCase(),
        statement: item.renterSays,
      },
    ]);
    if (evidenceError) throw new Error(`evidence insert failed: ${evidenceError.message}`);

    console.log(`  expecting: ${item.expect}`);
    const ruling = await resolveDispute(id);
    console.log(
      `  got: ${ruling.verdict} at ${ruling.confidence.toFixed(2)}` +
        (ruling.signed ? `, applied ${ruling.txHash}` : `, held back: ${ruling.heldBack}`)
    );
    console.log(`  reason: ${ruling.reason}`);
  }

  console.log("\nDone. Open /admin to read the log.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
