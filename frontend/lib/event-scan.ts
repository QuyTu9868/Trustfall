"use client";

import { createPublicClient, http, type AbiEvent, type Log, type PublicClient } from "viem";
import { hardhat } from "viem/chains";
import { targetChain } from "./chain";

/**
 * Reading a contract's past events on a free RPC plan, which cannot be done the obvious way.
 *
 * Both callers here used to ask for `fromBlock: "earliest"`, which is correct and which no
 * free endpoint will answer. Alchemy caps eth_getLogs at a ten block range and says so in a
 * 400; publicnode allows fifty thousand; drpc allows ten thousand. Neither hook noticed,
 * because both swallowed the error, so on Sepolia the rent figures on a rental card had
 * never once appeared and the "Released to you" total on a profile was permanently 0.00.
 * A wallet-signing test with a response listener attached is what finally said so.
 *
 * Recomputing the numbers locally was the other option and it is not available. The contract
 * settles rent against the timestamp it was settled at, and on the finalize-from-Active path
 * that timestamp is never stored: returnedAt stays zero. The figures genuinely only exist in
 * the event, so the event has to be read.
 *
 * So: bounded windows, newest first. Recent events are found in one request, and the walk
 * stops at whichever comes first, a hit or the end of the range worth searching.
 */

/** Under publicnode's fifty thousand cap with room to spare. */
const WINDOW = 45_000n;

/**
 * How far back to look before giving up: eight windows, so about three hundred and sixty
 * thousand blocks, which on Sepolia is roughly fifty days.
 *
 * A bound rather than the whole chain because the alternative is thousands of requests to
 * reach a genesis nothing was deployed near. Fifty days covers the life of this demo, and
 * the honest consequence of the limit is that a rental settled longer ago than that shows no
 * figures rather than wrong ones.
 */
const MAX_WINDOWS = 8n;

/**
 * A node that will answer a wide eth_getLogs, which is not the one the app reads state from.
 *
 * Overridable, and public on purpose: it is a URL with no key in it. Kept separate from
 * NEXT_PUBLIC_SEPOLIA_RPC_URL so that pointing the app at a different provider does not
 * quietly reintroduce the ten block cap.
 */
const LOGS_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_LOGS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

let cached: PublicClient | null = null;

function logsClient(): PublicClient {
  cached ??= createPublicClient({ chain: targetChain, transport: http(LOGS_RPC_URL) });
  return cached;
}

type Scan = {
  address: `0x${string}`;
  event: AbiEvent;
  args?: Record<string, unknown>;
  /** Stop as soon as a window has produced something. For a single rental's settlement. */
  stopOnFirst?: boolean;
};

/**
 * Every matching log this is willing to look for, newest window first.
 *
 * Returns what it found and never throws. A window that fails is skipped rather than fatal:
 * partial history renders a smaller number, and a thrown error renders nothing at all, which
 * is how this went unnoticed for as long as it did.
 *
 * On the local chain none of this applies. Hardhat answers "earliest" instantly and has a few
 * hundred blocks in total, so it takes the one-request path.
 */
export async function scanBack(
  local: PublicClient | undefined,
  { address, event, args, stopOnFirst }: Scan
): Promise<Log[]> {
  if (targetChain.id === hardhat.id) {
    if (!local) return [];
    return await local
      .getLogs({ address, event, args, fromBlock: "earliest" })
      .catch(() => []);
  }

  const client = logsClient();
  const latest = await client.getBlockNumber().catch(() => null);
  if (latest === null) return [];

  const found: Log[] = [];
  let toBlock = latest;

  for (let window = 0n; window < MAX_WINDOWS; window++) {
    if (toBlock === 0n) break;
    // Never below zero, and never a range wider than the provider will take.
    const fromBlock = toBlock > WINDOW ? toBlock - WINDOW : 0n;

    const logs = await client
      .getLogs({ address, event, args, fromBlock, toBlock })
      .catch(() => [] as Log[]);
    found.push(...logs);

    if (stopOnFirst && found.length) break;
    if (fromBlock === 0n) break;
    // Minus one, so the same block is not read twice at the seam between two windows.
    toBlock = fromBlock - 1n;
  }

  return found;
}
