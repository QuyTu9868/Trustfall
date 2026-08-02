import "server-only";
import { createPublicClient, http } from "viem";
import { localRpcUrl, targetChain } from "./chain";
import {
  STATUS,
  type Status,
  bytes32ToListingId,
  escrowAbi,
  escrowAddress,
  type RentalTuple,
} from "./escrow";

/**
 * Reads a rental from the contract, server side.
 *
 * Three routes need the same two facts before they will write anything: who the two
 * parties are, and what state the rental is in. None of it is taken from the request,
 * because a browser can claim to be anyone and claim any state. The contract is asked
 * instead, and it is the only thing that actually knows.
 */
export class RentalError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type OnChainRental = {
  id: bigint;
  owner: string;
  renter: string;
  status: Status;
};

const client = () =>
  createPublicClient({
    chain: targetChain,
    transport: http(targetChain.id === 31337 ? localRpcUrl : undefined),
  });

export async function readRental(rentalId: unknown): Promise<OnChainRental> {
  if (!escrowAddress) throw new RentalError("No escrow on this network.", 500);

  let id: bigint;
  try {
    id = BigInt(String(rentalId));
  } catch {
    throw new RentalError("That is not a rental id.", 400);
  }

  const tuple = (await client().readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "rentals",
    args: [id],
  })) as RentalTuple;

  const status = STATUS[tuple[11]];
  // Status None means the id was never used. Saying so beats letting the caller write
  // messages into a thread for a rental that does not exist.
  if (status === "None") throw new RentalError("No such rental.", 404);

  return { id, owner: tuple[1].toLowerCase(), renter: tuple[2].toLowerCase(), status };
}

/** The same read, but refusing anyone who is not one of the two parties. */
export async function readRentalAsParty(rentalId: unknown, caller: string) {
  const rental = await readRental(rentalId);
  if (caller !== rental.owner && caller !== rental.renter) {
    throw new RentalError("This rental is not yours.", 403);
  }
  return { rental, counterparty: caller === rental.owner ? rental.renter : rental.owner };
}

/**
 * Listing ids that are out on rent right now.
 *
 * The browse grid hides these. Ordinarily an item booked this week is still bookable for
 * next week, and hiding it costs the owner future business, but the call here was to keep
 * the grid to what can be collected today.
 *
 * One round trip for the whole page, not one per card: the contract keeps no index by
 * listing, so every rental is read in a single multicall and the ids are collected here.
 * Fine at demo size, and CLAUDE.md section 7 already parks indexers as a production
 * concern rather than a demo one.
 *
 * Only Active counts. Requested and Approved are agreements about days that may not have
 * started, and the item is still with its owner.
 */
export async function rentedOutListingIds(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!escrowAddress) return out;

  try {
    const publicClient = client();
    const nextId = (await publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "nextRentalId",
    })) as bigint;

    const count = Number(nextId) - 1;
    if (count <= 0) return out;

    // Plain parallel reads, not multicall. Multicall3 is a contract that has to exist on
    // the chain, and a fresh Hardhat node has never heard of it, so the batched version
    // threw on every local page load. Sepolia does have it, but one code path that works
    // on both beats a faster one that quietly does nothing where the app is developed.
    const rentals = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        publicClient.readContract({
          address: escrowAddress!,
          abi: escrowAbi,
          functionName: "rentals",
          args: [BigInt(index + 1)],
        })
      )
    );

    for (const rental of rentals) {
      const tuple = rental as RentalTuple;
      if (STATUS[tuple[11]] === "Active") out.add(bytes32ToListingId(tuple[0]));
    }
  } catch (error) {
    // A browse page that will not load because the chain is unreachable is worse than one
    // showing an item somebody already has, so this falls back to hiding nothing. It says
    // so in the log though: swallowing this in silence is what let a broken multicall look
    // like an empty marketplace for a whole afternoon.
    console.error("Could not read rentals, so nothing is being hidden:", error);
  }

  return out;
}
