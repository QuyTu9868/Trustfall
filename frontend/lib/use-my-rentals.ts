"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { targetChain } from "./chain";
import {
  type Rental,
  type RentalTuple,
  escrowAbi,
  escrowAddress,
  toRental,
} from "./escrow";

/**
 * Every rental the signed in wallet is part of, on either side.
 *
 * Reads them all and filters here, because the contract keeps no index by address and
 * adding one would mean a second mapping written on every request. Fine at demo size: the
 * reads are batched into one multicall. A real deployment would put an indexer in front,
 * which CLAUDE.md section 7 already parks as a production concern rather than a demo one.
 */
export function useMyRentals() {
  const { address } = useAccount();

  const { data: nextId } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextRentalId",
    chainId: targetChain.id,
    query: { enabled: Boolean(escrowAddress), refetchInterval: 4000 },
  });

  const count = nextId ? Number(nextId) - 1 : 0;
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "rentals",
      chainId: targetChain.id,
      args: [id],
    })),
    query: { enabled: count > 0 && Boolean(escrowAddress), refetchInterval: 4000 },
  });

  const mine: Rental[] = [];
  if (address && data) {
    const me = address.toLowerCase();
    data.forEach((entry, index) => {
      if (entry.status !== "success") return;
      const rental = toRental(ids[index], entry.result as RentalTuple);
      if (
        rental.owner.toLowerCase() === me ||
        rental.renter.toLowerCase() === me
      ) {
        mine.push(rental);
      }
    });
  }

  // Newest first: the thing you just did is the thing you want to see.
  mine.reverse();

  return { rentals: mine, loading: isLoading, refetch, connected: Boolean(address) };
}
