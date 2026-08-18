"use client";

import { useReadContracts } from "wagmi";
import { targetChain } from "./chain";
import { escrowAbi, escrowAddress, listingIdToBytes32 } from "./escrow";

/**
 * How far ahead to ask. Thirty is the longest rental the contract allows, so sixty days
 * covers a full-length booking started a month out and still fits in one multicall.
 */
const HORIZON = 60;

/**
 * The days this listing is already spoken for, read from the mapping the contract itself
 * checks before it accepts a booking.
 *
 * Read rather than derived from rentals. The same answer could be assembled from each
 * rental's dates and status, but then the screen and the contract would be two separate
 * opinions about whether a day is free, and the day they disagreed the renter would be
 * told yes and then refused by a revert they cannot read. bookedDay is the actual gate.
 *
 * Two things about that mapping are worth knowing before trusting this:
 *
 * - It is written when the OWNER APPROVES, not when a renter asks. So a day with a
 *   pending request on it still reads as free, and it genuinely is: the contract would
 *   accept a second request for it, and whichever the owner approves first takes it.
 *   Saying otherwise here would invent a rule the contract does not have.
 * - The end day is never booked. A rental runs in nights and the last day is the one the
 *   item comes back, so somebody else may start theirs on it.
 *
 * Batched into a single eth_call through Multicall3, which is why sixty separate reads
 * are affordable. No polling: availability changes when an owner approves something, and
 * a stale answer costs a rejected request rather than a wrong number about money.
 */
export function useBookedDays(listingId: string, fromDay: number | null) {
  const key = listingId ? listingIdToBytes32(listingId) : null;
  const days =
    fromDay === null ? [] : Array.from({ length: HORIZON }, (_, index) => fromDay + index);

  const { data } = useReadContracts({
    contracts: days.map((day) => ({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "bookedDay",
      chainId: targetChain.id,
      args: [key, BigInt(day)],
    })),
    query: { enabled: Boolean(key) && Boolean(escrowAddress) && fromDay !== null },
  });

  const taken = new Set<number>();
  data?.forEach((entry, index) => {
    // A day nobody has taken holds zero. A read that failed holds nothing at all, and is
    // left out rather than guessed at: showing a free day as taken loses the owner a
    // booking, and this side of the check is not the one protecting anybody.
    if (entry.status === "success" && (entry.result as bigint) !== 0n) {
      taken.add(days[index]);
    }
  });

  return taken;
}

/** Consecutive days folded into ranges, so a fortnight reads as one line rather than fourteen. */
export function toRanges(days: Set<number>) {
  const sorted = [...days].sort((a, b) => a - b);
  const ranges: { from: number; to: number }[] = [];

  for (const day of sorted) {
    const last = ranges.at(-1);
    if (last && day === last.to + 1) last.to = day;
    else ranges.push({ from: day, to: day });
  }

  return ranges;
}

/** A day index back into the date it stands for, in the reader's own locale. */
export function dayLabel(day: number) {
  return new Date(day * 86_400_000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
