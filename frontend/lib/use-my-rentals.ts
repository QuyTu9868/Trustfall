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
 *
 * The interval is the expensive decision, not the shape of the read. At four seconds one
 * open tab measured 47 eth_calls in 45 seconds, which is 2.3M Alchemy compute units a day,
 * and a free month is 30M. A tab nobody was looking at could spend the month in under a
 * fortnight, which is roughly what happened.
 *
 * Thirty seconds instead, and only while the tab is visible. Nothing here needs to be fresh
 * to the second: every action that changes a rental calls refetch on its way out, so the
 * poll is a safety net for changes the other party made, not the mechanism. Coming back to
 * a tab refetches immediately, so the stale window is a moment after focus and not thirty
 * seconds of wrong.
 */
const POLL_MS = 30_000;
export function useMyRentals() {
  const { address } = useAccount();

  const { data: nextId } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextRentalId",
    chainId: targetChain.id,
    query: { enabled: Boolean(escrowAddress), refetchInterval: POLL_MS },
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
    query: { enabled: count > 0 && Boolean(escrowAddress), refetchInterval: POLL_MS },
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
