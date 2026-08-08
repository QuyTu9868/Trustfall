import "server-only";
import { createPublicClient, decodeEventLog, formatUnits, http } from "viem";
import { rpcUrl, targetChain } from "./chain";
import { escrowAbi, escrowAddress } from "./escrow";

/**
 * What a ruling actually did to the deposit, read back off the chain.
 *
 * The log already says which of three ways a deposit went, and that is a claim. This is the
 * receipt: the two figures the contract emitted while moving the money, decoded from the
 * transaction the agent's key signed. Nobody has to take the word "split" on trust when the
 * amounts are sitting in an event under a hash anyone can open.
 *
 * Read rather than recomputed, deliberately. Deriving the numbers from the verdict and the
 * deposit would produce the same two figures almost always, and "almost always" is the wrong
 * standard for a page whose job is to show what happened rather than what should have. If
 * the contract is ever changed, this keeps telling the truth and the arithmetic would not.
 */
export type Settlement = {
  /** USDC, already formatted, because six decimals is a detail of storage and not of money. */
  toRenter: string;
  toOwner: string;
  total: string;
};

export async function readSettlement(txHash: string): Promise<Settlement | null> {
  if (!escrowAddress || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;

  try {
    const client = createPublicClient({ chain: targetChain, transport: http(rpcUrl()) });
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    for (const log of receipt.logs) {
      // The receipt carries logs from every contract the transaction touched, and a deposit
      // moving means USDC emitted Transfer events of its own. Only the escrow's own event
      // names both parties in one place, so the others are skipped rather than added up.
      if (log.address.toLowerCase() !== escrowAddress.toLowerCase()) continue;

      let decoded;
      try {
        decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
      } catch {
        // A log from the escrow that this ABI does not describe. Not an error: the same
        // transaction settles rent and closes the rental, and those are different events.
        continue;
      }

      if (decoded.eventName !== "DisputeResolved") continue;
      const { toRenter, toOwner } = decoded.args as unknown as {
        toRenter: bigint;
        toOwner: bigint;
      };
      return {
        toRenter: formatUnits(toRenter, 6),
        toOwner: formatUnits(toOwner, 6),
        total: formatUnits(toRenter + toOwner, 6),
      };
    }
    return null;
  } catch {
    // An unreachable node, or a hash from a chain this build is not pointed at. The page
    // still has the verdict and the hash to show, and a missing pair of figures is better
    // than an error where the ruling should be.
    return null;
  }
}
