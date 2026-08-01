import "server-only";
import { createPublicClient, http } from "viem";
import { localRpcUrl, targetChain } from "./chain";
import { STATUS, type Status, escrowAbi, escrowAddress, type RentalTuple } from "./escrow";

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
