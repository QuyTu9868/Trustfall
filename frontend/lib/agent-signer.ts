import "server-only";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rpcUrl, targetChain } from "./chain";
import type { DisputeVerdict } from "./arbitrate";
import { escrowAbi, escrowAddress } from "./escrow";

/**
 * The only place a key is used on behalf of the agent, and the agent cannot reach it.
 *
 * CLAUDE.md section 6: the agent proposes over HTTP and the server signs. That split is
 * what makes the model replaceable and the damage bounded. A model that has been talked
 * into anything at all still only ever returns one of three words, and this function is
 * the only thing that turns a word into a transaction.
 *
 * Three checks before signing, and none of them trust the caller:
 *   the rental is read back from the chain and must actually be in dispute,
 *   the verdict must be one of the three the contract knows,
 *   the confidence must clear the bar, or a human resolves it instead.
 *
 * No amount is passed. The contract reads the deposit from its own storage and splits it,
 * so a stolen key cannot drain the escrow or redirect a payment, only pick the wrong one
 * of three outcomes on a rental that was already being argued over.
 */
export class NotSigned extends Error {}

/** Contract enum order, and the reason these three strings exist in that order. */
const VERDICT_INDEX: Record<DisputeVerdict["verdict"], number> = {
  refund_renter: 0,
  split: 1,
  pay_owner: 2,
};

export async function signVerdict(rentalId: bigint, verdict: DisputeVerdict["verdict"]) {
  const key = process.env.AGENT_SIGNER_PRIVATE_KEY;
  if (!key) {
    throw new NotSigned(
      "No AGENT_SIGNER_PRIVATE_KEY, so nothing can be signed. Set it in frontend/.env.local."
    );
  }
  if (!escrowAddress) throw new NotSigned("No escrow on this network.");

  const index = VERDICT_INDEX[verdict];
  if (index === undefined) throw new NotSigned(`Not a verdict this contract knows: ${verdict}`);

  const client = createWalletClient({
    account: privateKeyToAccount(key as `0x${string}`),
    chain: targetChain,
    transport: http(rpcUrl()),
  }).extend(publicActions);

  // Simulated first. A revert here is the contract refusing, and finding that out before
  // spending gas means the reason reaches the log as a sentence rather than as a failed
  // receipt nobody can read.
  const { request } = await client.simulateContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "resolveDispute",
    args: [rentalId, index],
  });

  const hash = await client.writeContract(request);
  await client.waitForTransactionReceipt({ hash });
  return hash;
}
